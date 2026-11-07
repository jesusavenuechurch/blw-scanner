import * as SQLite from 'expo-sqlite';
import type { RemotePartner } from './api';
import { normalizeIso, searchText, startOfLocalDayIso, type GateCheckin } from './gate';

/** Local copy of the guest list and every check-in this phone knows about. */
export interface LocalPartner {
  id: number;
  title: string | null;
  full_name: string;
  tier: string;
  tier_label: string;
  church: string | null;
  zone: string | null;
  is_registered: boolean;
  coming_with_spouse: boolean;
  spouse_title: string | null;
  spouse_name: string | null;
  qr_token: string | null;
  photo_version: number | null;
  photo_local_version: number | null;
  photo_file: string | null;
}

export interface LocalCheckin extends GateCheckin {
  uuid: string;
  partner_id: number;
  synced: boolean;
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) dbPromise = open();
  return dbPromise;
}

async function open() {
  const db = await SQLite.openDatabaseAsync('blw-scanner.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS partners (
      id INTEGER PRIMARY KEY NOT NULL,
      title TEXT, full_name TEXT NOT NULL, search TEXT NOT NULL DEFAULT '',
      tier TEXT, tier_label TEXT, church TEXT, zone TEXT,
      is_registered INTEGER NOT NULL DEFAULT 0,
      coming_with_spouse INTEGER NOT NULL DEFAULT 0, spouse_title TEXT, spouse_name TEXT,
      qr_token TEXT,
      photo_version INTEGER, photo_local_version INTEGER, photo_file TEXT
    );
    CREATE TABLE IF NOT EXISTS checkins (
      uuid TEXT PRIMARY KEY NOT NULL,
      partner_id INTEGER NOT NULL,
      checked_in_at TEXT NOT NULL,
      device_name TEXT,
      origin TEXT NOT NULL DEFAULT 'here',
      synced INTEGER NOT NULL DEFAULT 0,
      rejected INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS checkins_partner_time ON checkins (partner_id, checked_in_at);
    CREATE INDEX IF NOT EXISTS checkins_pending ON checkins (synced);
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY NOT NULL, value TEXT);
  `);
  return db;
}

type PartnerRow = Omit<LocalPartner, 'is_registered' | 'coming_with_spouse'> & { is_registered: number; coming_with_spouse: number };

function toPartner(r: PartnerRow): LocalPartner {
  return { ...r, is_registered: !!r.is_registered, coming_with_spouse: !!r.coming_with_spouse };
}

/* ——— meta ——— */

export async function getMeta(key: string): Promise<string | null> {
  const row = await (await getDb()).getFirstAsync<{ value: string | null }>('SELECT value FROM meta WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string | null): Promise<void> {
  await (await getDb()).runAsync('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}

/* ——— partners ——— */

export async function upsertPartners(rows: RemotePartner[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    const stmt = await tx.prepareAsync(`
      INSERT INTO partners (id, title, full_name, search, tier, tier_label, church, zone, is_registered, coming_with_spouse, spouse_title, spouse_name, qr_token, photo_version)
      VALUES ($id, $title, $full_name, $search, $tier, $tier_label, $church, $zone, $is_registered, $coming_with_spouse, $spouse_title, $spouse_name, $qr_token, $photo_version)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title, full_name = excluded.full_name, search = excluded.search, tier = excluded.tier,
        tier_label = excluded.tier_label, church = excluded.church, zone = excluded.zone,
        is_registered = excluded.is_registered, coming_with_spouse = excluded.coming_with_spouse,
        spouse_title = excluded.spouse_title, spouse_name = excluded.spouse_name,
        qr_token = excluded.qr_token, photo_version = excluded.photo_version
    `);
    try {
      for (const p of rows) {
        await stmt.executeAsync({
          $id: p.id,
          $title: p.title,
          $full_name: p.full_name,
          $search: searchText(p.title, p.full_name, p.spouse_name, p.church, p.zone),
          $tier: p.tier,
          $tier_label: p.tier_label,
          $church: p.church,
          $zone: p.zone,
          $is_registered: p.is_registered ? 1 : 0,
          $coming_with_spouse: p.coming_with_spouse ? 1 : 0,
          $spouse_title: p.spouse_title,
          $spouse_name: p.spouse_name,
          $qr_token: p.qr_token,
          $photo_version: p.photo_version,
        });
      }
    } finally {
      await stmt.finalizeAsync();
    }
  });
}

/** Removes partners and returns their local photo files so they can be deleted. */
export async function deletePartners(ids: number[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const db = await getDb();
  const marks = ids.map(() => '?').join(',');
  const files = await db.getAllAsync<{ photo_file: string | null }>(`SELECT photo_file FROM partners WHERE id IN (${marks})`, ...ids);
  await db.runAsync(`DELETE FROM partners WHERE id IN (${marks})`, ...ids);
  return files.map((f) => f.photo_file).filter((f): f is string => !!f);
}

export async function allPartnerIds(): Promise<number[]> {
  return (await (await getDb()).getAllAsync<{ id: number }>('SELECT id FROM partners')).map((r) => r.id);
}

export async function findPartner(id: number): Promise<LocalPartner | null> {
  const row = await (await getDb()).getFirstAsync<PartnerRow>('SELECT * FROM partners WHERE id = ?', id);
  return row ? toPartner(row) : null;
}

export async function searchPartners(query: string, limit = 60): Promise<(LocalPartner & { checked_in_today: boolean })[]> {
  const db = await getDb();
  const today = startOfLocalDayIso();
  const words = searchText(query).split(/\s+/).filter(Boolean);
  const where = words.map(() => 'p.search LIKE ?').join(' AND ') || '1 = 1';
  const rows = await db.getAllAsync<PartnerRow & { checked_in_today: number }>(
    `SELECT p.*, EXISTS (SELECT 1 FROM checkins c WHERE c.partner_id = p.id AND c.checked_in_at >= ?) AS checked_in_today
     FROM partners p WHERE ${where} ORDER BY p.full_name COLLATE NOCASE LIMIT ?`,
    today,
    ...words.map((w) => `%${w}%`),
    limit,
  );
  return rows.map((r) => ({ ...toPartner(r), checked_in_today: !!r.checked_in_today }));
}

export async function partnersNeedingPhotos(): Promise<{ id: number; photo_version: number; photo_file: string | null }[]> {
  return (await getDb()).getAllAsync(
    'SELECT id, photo_version, photo_file FROM partners WHERE photo_version IS NOT NULL AND (photo_local_version IS NULL OR photo_local_version != photo_version)',
  );
}

export async function partnersWithStalePhotos(): Promise<{ id: number; photo_file: string }[]> {
  return (await getDb()).getAllAsync('SELECT id, photo_file FROM partners WHERE photo_version IS NULL AND photo_file IS NOT NULL');
}

export async function setPartnerPhoto(id: number, version: number | null, file: string | null): Promise<void> {
  await (await getDb()).runAsync('UPDATE partners SET photo_local_version = ?, photo_file = ? WHERE id = ?', version, file, id);
}

/* ——— check-ins ——— */

export async function todaysCheckins(partnerId: number): Promise<LocalCheckin[]> {
  const rows = await (await getDb()).getAllAsync<Omit<LocalCheckin, 'synced'> & { synced: number }>(
    'SELECT uuid, partner_id, checked_in_at, device_name, origin, synced FROM checkins WHERE partner_id = ? AND checked_in_at >= ? ORDER BY checked_in_at DESC',
    partnerId,
    startOfLocalDayIso(),
  );
  return rows.map((r) => ({ ...r, synced: !!r.synced }));
}

export async function addLocalCheckin(uuid: string, partnerId: number, at: Date, deviceName: string): Promise<void> {
  await (await getDb()).runAsync(
    "INSERT INTO checkins (uuid, partner_id, checked_in_at, device_name, origin, synced) VALUES (?, ?, ?, ?, 'here', 0)",
    uuid,
    partnerId,
    at.toISOString(),
    deviceName,
  );
}

export async function pendingCheckins(limit = 200) {
  return (await getDb()).getAllAsync<{ uuid: string; partner_id: number; checked_in_at: string }>(
    'SELECT uuid, partner_id, checked_in_at FROM checkins WHERE synced = 0 ORDER BY checked_in_at LIMIT ?',
    limit,
  );
}

export async function markSynced(uuids: string[], rejected = false): Promise<void> {
  if (uuids.length === 0) return;
  const marks = uuids.map(() => '?').join(',');
  await (await getDb()).runAsync(`UPDATE checkins SET synced = 1, rejected = ? WHERE uuid IN (${marks})`, rejected ? 1 : 0, ...uuids);
}

export async function addRemoteCheckins(rows: { uuid: string | null; id: number; partner_id: number; checked_in_at: string; device_name: string | null }[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await getDb();
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const r of rows) {
      // Our own uploads come back here too; INSERT OR IGNORE keeps the local row.
      await tx.runAsync(
        "INSERT OR IGNORE INTO checkins (uuid, partner_id, checked_in_at, device_name, origin, synced) VALUES (?, ?, ?, ?, 'remote', 1)",
        r.uuid ?? `server-${r.id}`,
        r.partner_id,
        normalizeIso(r.checked_in_at),
        r.device_name,
      );
    }
  });
}

export async function stats() {
  const db = await getDb();
  const today = startOfLocalDayIso();
  const row = await db.getFirstAsync<{
    partners: number;
    registered: number;
    photos_expected: number;
    photos_ready: number;
    pending: number;
    here_today: number;
    arrived_today: number;
  }>(
    `SELECT
      (SELECT COUNT(*) FROM partners) AS partners,
      (SELECT COUNT(*) FROM partners WHERE is_registered = 1) AS registered,
      (SELECT COUNT(*) FROM partners WHERE photo_version IS NOT NULL) AS photos_expected,
      (SELECT COUNT(*) FROM partners WHERE photo_version IS NOT NULL AND photo_local_version = photo_version) AS photos_ready,
      (SELECT COUNT(*) FROM checkins WHERE synced = 0) AS pending,
      (SELECT COUNT(*) FROM checkins WHERE origin = 'here' AND checked_in_at >= ?) AS here_today,
      (SELECT COUNT(DISTINCT partner_id) FROM checkins WHERE checked_in_at >= ?) AS arrived_today`,
    today,
    today,
  );
  return row!;
}

export async function recentCheckinsHere(limit = 8) {
  return (await getDb()).getAllAsync<{ uuid: string; partner_id: number; checked_in_at: string; synced: number; full_name: string | null; title: string | null; tier: string | null; photo_file: string | null }>(
    `SELECT c.uuid, c.partner_id, c.checked_in_at, c.synced, p.full_name, p.title, p.tier, p.photo_file
     FROM checkins c LEFT JOIN partners p ON p.id = c.partner_id
     WHERE c.origin = 'here' ORDER BY c.checked_in_at DESC LIMIT ?`,
    limit,
  );
}

/** Wipes everything (used when unpairing). */
export async function resetDatabase(): Promise<void> {
  await (await getDb()).execAsync('DELETE FROM partners; DELETE FROM checkins; DELETE FROM meta;');
}

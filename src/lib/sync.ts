import { api, ApiError } from './api';
import {
  addRemoteCheckins,
  allPartnerIds,
  deletePartners,
  getMeta,
  markSynced,
  pendingCheckins,
  setMeta,
  upsertPartners,
} from './db';
import { deletePhotoFile, syncPhotos } from './photos';
import type { Session } from './session';

export type SyncPhase = 'idle' | 'uploading' | 'partners' | 'checkins' | 'photos';

export interface SyncReport {
  uploaded: number;
  partnersChanged: number;
  partnersRemoved: number;
  remoteCheckins: number;
  photos: number;
}

let running: Promise<SyncReport> | null = null;

/**
 * One sync pass, in the order that matters at the door:
 *  1. upload check-ins made on this phone (so other doors see them soon),
 *  2. pull changed and deleted partners,
 *  3. pull check-ins made at other doors,
 *  4. download new or changed photos.
 *
 * Calls made while a sync is already running share it.
 */
export function runSync(session: Session, opts: { full?: boolean; onPhase?: (p: SyncPhase, detail?: string) => void } = {}): Promise<SyncReport> {
  if (!running) {
    running = doSync(session, opts).finally(() => {
      running = null;
      opts.onPhase?.('idle');
    });
  }
  return running;
}

export function isSyncing() {
  return running !== null;
}

async function doSync(session: Session, { full = false, onPhase }: { full?: boolean; onPhase?: (p: SyncPhase, detail?: string) => void }): Promise<SyncReport> {
  const report: SyncReport = { uploaded: 0, partnersChanged: 0, partnersRemoved: 0, remoteCheckins: 0, photos: 0 };

  // 1. Upload
  onPhase?.('uploading');
  for (;;) {
    const batch = await pendingCheckins(200);
    if (batch.length === 0) break;
    const res = await api.pushCheckins(session, batch);
    await markSynced(res.accepted);
    // A partner deleted on the server can't take the check-in; keep it marked so we stop retrying.
    await markSynced(res.rejected.map((r) => r.uuid), true);
    report.uploaded += res.accepted.length;
    if (res.accepted.length + res.rejected.length === 0) break;
  }

  // 2. Partners
  onPhase?.('partners');
  const since = full ? null : await getMeta('partners_since');
  const delta = await api.partners(session, since);
  await upsertPartners(delta.partners);
  report.partnersChanged = delta.partners.length;

  let removed = delta.deleted_ids;
  if (delta.full) {
    const keep = new Set(delta.partners.map((p) => p.id));
    removed = (await allPartnerIds()).filter((id) => !keep.has(id));
  }
  for (const file of await deletePartners(removed)) deletePhotoFile(file);
  report.partnersRemoved = removed.length;
  await setMeta('partners_since', delta.server_time);

  // 3. Check-ins from other doors
  onPhase?.('checkins');
  let after = full ? 0 : Number((await getMeta('checkins_after_id')) ?? 0);
  for (let page = 0; page < 50; page++) {
    const res = await api.pullCheckins(session, after);
    await addRemoteCheckins(res.checkins);
    report.remoteCheckins += res.checkins.length;
    after = res.last_id;
    await setMeta('checkins_after_id', String(after));
    if (!res.has_more) break;
  }

  // 4. Photos
  onPhase?.('photos');
  report.photos = await syncPhotos(session, (done, total) => onPhase?.('photos', `${done}/${total}`));

  await setMeta('last_sync_at', new Date().toISOString());
  return report;
}

export { ApiError };

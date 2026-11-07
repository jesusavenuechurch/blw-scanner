import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import { api, ApiError } from '@/lib/api';
import { addLocalCheckin, findPartner, getMeta, resetDatabase, stats as readStats, todaysCheckins, upsertPartners, type LocalCheckin, type LocalPartner } from '@/lib/db';
import { decide } from '@/lib/gate';
import { deleteAllPhotos } from '@/lib/photos';
import { parseScannedCode } from '@/lib/qr';
import { clearSession, loadSession, saveSession, type Session } from '@/lib/session';
import { runSync, type SyncPhase } from '@/lib/sync';

const AUTO_SYNC_MS = 20_000;

export type ScanResult =
  | { kind: 'welcome'; partner: LocalPartner; via: 'local' | 'online' }
  | { kind: 'again'; partner: LocalPartner; last: LocalCheckin }
  | { kind: 'not_registered'; partner: LocalPartner }
  | { kind: 'forged'; partner: LocalPartner }
  | { kind: 'not_found'; offline: boolean }
  | { kind: 'unknown' };

type Stats = Awaited<ReturnType<typeof readStats>>;

interface ScannerState {
  ready: boolean;
  session: Session | null;
  online: boolean;
  phase: SyncPhase;
  phaseDetail?: string;
  lastSyncAt: string | null;
  syncError: string | null;
  stats: Stats | null;
  notice: string | null;
  pair: (apiUrl: string, code: string) => Promise<void>;
  unpair: () => Promise<void>;
  syncNow: (full?: boolean) => Promise<void>;
  refreshStats: () => Promise<void>;
  resolveScan: (raw: string) => Promise<ScanResult>;
  checkIn: (partner: LocalPartner) => Promise<void>;
  clearNotice: () => void;
}

const Ctx = createContext<ScannerState | null>(null);

export function useScanner() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useScanner must be used inside <ScannerProvider>');
  return v;
}

export function ScannerProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [online, setOnline] = useState(true);
  const [phase, setPhase] = useState<SyncPhase>('idle');
  const [phaseDetail, setPhaseDetail] = useState<string | undefined>();
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  sessionRef.current = session;

  const refreshStats = useCallback(async () => {
    setStats(await readStats());
    setLastSyncAt(await getMeta('last_sync_at'));
  }, []);

  const forgetDevice = useCallback(async (message: string | null) => {
    await clearSession();
    await resetDatabase();
    deleteAllPhotos();
    setSession(null);
    setStats(null);
    setLastSyncAt(null);
    setNotice(message);
  }, []);

  const syncNow = useCallback(
    async (full = false) => {
      const s = sessionRef.current;
      if (!s) return;
      try {
        await runSync(s, {
          full,
          onPhase: (p, detail) => {
            setPhase(p);
            setPhaseDetail(detail);
          },
        });
        setSyncError(null);
      } catch (e) {
        if (e instanceof ApiError && e.unpaired) {
          await forgetDevice('This phone was disconnected from the workspace. Pair it again to keep scanning.');
          return;
        }
        setSyncError(e instanceof Error ? e.message : 'Sync failed.');
      } finally {
        await refreshStats();
      }
    },
    [forgetDevice, refreshStats],
  );

  // Boot: restore the paired session.
  useEffect(() => {
    (async () => {
      const s = await loadSession();
      setSession(s);
      if (s) await refreshStats();
      setReady(true);
    })();
  }, [refreshStats]);

  // Connectivity.
  useEffect(() => {
    return NetInfo.addEventListener((state) => {
      const isOnline = !!state.isConnected && state.isInternetReachable !== false;
      setOnline((was) => {
        if (!was && isOnline) void syncNow(); // Back online: catch up straight away.
        return isOnline;
      });
    });
  }, [syncNow]);

  // Background sync while the app is open, and whenever it comes back to the front.
  useEffect(() => {
    if (!session) return;
    void syncNow();
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void syncNow();
    }, AUTO_SYNC_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && void syncNow());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
    // Only restart when the paired device changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  const pair = useCallback(
    async (apiUrl: string, code: string) => {
      const res = await api.pair(apiUrl, code);
      const s: Session = { api: apiUrl, token: res.token, deviceId: res.device.id, deviceName: res.device.name, eventName: res.event.name };
      await resetDatabase();
      deleteAllPhotos();
      await saveSession(s);
      setNotice(null);
      setSession(s);
    },
    [],
  );

  const unpair = useCallback(() => forgetDevice(null), [forgetDevice]);

  const resolveScan = useCallback(async (raw: string): Promise<ScanResult> => {
    const code = parseScannedCode(raw);
    if (code.kind !== 'partner') return { kind: 'unknown' };

    let partner = await findPartner(code.id);
    let via: 'local' | 'online' = 'local';

    // Not on this phone yet (registered after the last sync): ask the server.
    if (!partner && sessionRef.current) {
      try {
        const res = await api.lookup(sessionRef.current, raw);
        await upsertPartners([res.partner]);
        partner = await findPartner(res.partner.id);
        via = 'online';
      } catch (e) {
        const offline = e instanceof ApiError && e.status === 0;
        return { kind: 'not_found', offline };
      }
    }
    if (!partner) return { kind: 'not_found', offline: false };

    const todays = await todaysCheckins(partner.id);
    const decision = decide(partner, code.token, todays);
    switch (decision.kind) {
      case 'welcome':
        return { kind: 'welcome', partner, via };
      case 'again':
        return { kind: 'again', partner, last: todays[0] };
      default:
        return { kind: decision.kind, partner };
    }
  }, []);

  const checkIn = useCallback(
    async (partner: LocalPartner) => {
      const s = sessionRef.current;
      if (!s) return;
      await addLocalCheckin(Crypto.randomUUID(), partner.id, new Date(), s.deviceName);
      await refreshStats();
      // Upload soon, batching quick successive scans.
      if (pushTimer.current) clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(() => void syncNow(), 1500);
    },
    [refreshStats, syncNow],
  );

  const value = useMemo<ScannerState>(
    () => ({
      ready,
      session,
      online,
      phase,
      phaseDetail,
      lastSyncAt,
      syncError,
      stats,
      notice,
      pair,
      unpair,
      syncNow,
      refreshStats,
      resolveScan,
      checkIn,
      clearNotice: () => setNotice(null),
    }),
    [ready, session, online, phase, phaseDetail, lastSyncAt, syncError, stats, notice, pair, unpair, syncNow, refreshStats, resolveScan, checkIn],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

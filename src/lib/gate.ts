/**
 * The door decision for a scanned partner. Pure, so it is unit-tested.
 */
export interface GatePartner {
  id: number;
  is_registered: boolean;
  qr_token: string | null;
}

export interface GateCheckin {
  checked_in_at: string; // ISO time
  device_name: string | null;
  origin: 'here' | 'remote';
}

export type GateDecision =
  | { kind: 'welcome' }
  | { kind: 'again'; last: GateCheckin }
  | { kind: 'not_registered' }
  | { kind: 'forged' };

/**
 * @param scannedToken the ?t= from the pass, or null for older passes and manual check-ins
 * @param todays this partner's check-ins since local midnight, newest first
 */
export function decide(partner: GatePartner, scannedToken: string | null, todays: GateCheckin[]): GateDecision {
  if (scannedToken !== null && partner.qr_token && scannedToken !== partner.qr_token) {
    return { kind: 'forged' };
  }
  if (!partner.is_registered) {
    return { kind: 'not_registered' };
  }
  if (todays.length > 0) {
    return { kind: 'again', last: todays[0] };
  }
  return { kind: 'welcome' };
}

/** Local midnight as an ISO string, for "today" queries against ISO timestamps. */
export function startOfLocalDayIso(now: Date = new Date()): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Server times look like 2026-11-07T08:13:00+00:00; store everything as Date#toISOString so string comparison works. */
export function normalizeIso(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

/** Builds the lowercase, accent-free text the guest search matches against. */
export function searchText(...parts: (string | null | undefined)[]): string {
  return parts
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

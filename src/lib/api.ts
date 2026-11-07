import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { Session } from './session';

export const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

/** Partner as the server sends it (see App\Support\ScannerPayload). */
export interface RemotePartner {
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
  updated_at: string | null;
}

export interface RemoteCheckin {
  id: number;
  uuid: string | null;
  partner_id: number;
  checked_in_at: string;
  device_name: string | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
  /** The server no longer accepts this phone (revoked or token removed). */
  get unpaired() {
    return this.status === 401;
  }
}

async function request<T>(api: string, path: string, init: RequestInit & { token?: string; timeoutMs?: number } = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 15000);
  try {
    const res = await fetch(`${api}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-App-Version': APP_VERSION,
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ApiError((body as { message?: string }).message ?? `The server answered ${res.status}.`, res.status);
    }
    return body as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if ((e as Error).name === 'AbortError') throw new ApiError('The server took too long to answer.', 0);
    throw new ApiError('Can’t reach the server. Check the Wi-Fi or mobile data.', 0);
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  pair: (apiUrl: string, code: string) =>
    request<{ token: string; device: { id: number; name: string }; event: { name: string; subtitle: string } }>(apiUrl, '/scanner/v1/pair', {
      method: 'POST',
      body: JSON.stringify({ code, platform: Platform.OS, app_version: APP_VERSION }),
    }),

  me: (s: Session) =>
    request<{ device: { id: number; name: string }; counts: { partners: number; registered: number; checked_in_today: number } }>(s.api, '/scanner/v1/me', {
      token: s.token,
      timeoutMs: 6000,
    }),

  partners: (s: Session, since: string | null) =>
    request<{ full: boolean; server_time: string; partners: RemotePartner[]; deleted_ids: number[] }>(
      s.api,
      `/scanner/v1/partners${since ? `?since=${encodeURIComponent(since)}` : ''}`,
      { token: s.token, timeoutMs: 60000 },
    ),

  lookup: (s: Session, code: string) =>
    request<{ partner: RemotePartner }>(s.api, `/scanner/v1/lookup?code=${encodeURIComponent(code)}`, { token: s.token, timeoutMs: 5000 }),

  search: (s: Session, q: string) =>
    request<{ partners: RemotePartner[] }>(s.api, `/scanner/v1/search?q=${encodeURIComponent(q)}`, { token: s.token, timeoutMs: 6000 }),

  pushCheckins: (s: Session, checkins: { uuid: string; partner_id: number; checked_in_at: string }[]) =>
    request<{ accepted: string[]; rejected: { uuid: string; reason: string }[] }>(s.api, '/scanner/v1/checkins', {
      token: s.token,
      method: 'POST',
      body: JSON.stringify({ checkins }),
    }),

  pullCheckins: (s: Session, afterId: number) =>
    request<{ checkins: RemoteCheckin[]; last_id: number; has_more: boolean }>(s.api, `/scanner/v1/checkins?after_id=${afterId}`, {
      token: s.token,
    }),

  photoUrl: (s: Session, partnerId: number) => `${s.api}/scanner/v1/partners/${partnerId}/photo`,
};

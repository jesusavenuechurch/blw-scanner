/**
 * Reads whatever the camera saw. Pure — no React Native imports — so it
 * can be unit-tested with plain Node.
 *
 *  - Partner passes encode a link: https://…/partner/verify/{id}?t={token}
 *    (older passes have no ?t=).
 *  - The workspace's pairing QR is JSON: {"type":"blw-scanner-pair","api":"…","code":"…"}
 *  - Ushers may also type a bare partner number.
 */
export type ScannedCode =
  | { kind: 'partner'; id: number; token: string | null }
  | { kind: 'pair'; api: string; code: string }
  | { kind: 'unknown'; raw: string };

export function parseScannedCode(raw: string): ScannedCode {
  const text = (raw ?? '').trim();

  if (/^\d{1,9}$/.test(text)) {
    return { kind: 'partner', id: Number(text), token: null };
  }

  if (text.startsWith('{')) {
    try {
      const json = JSON.parse(text) as { type?: unknown; api?: unknown; code?: unknown };
      if (json.type === 'blw-scanner-pair' && typeof json.api === 'string' && typeof json.code === 'string') {
        return { kind: 'pair', api: normalizeApiUrl(json.api), code: normalizePairingCode(json.code) };
      }
    } catch {
      // Not JSON after all.
    }
    return { kind: 'unknown', raw: text };
  }

  const match = text.match(/\/partner\/verify\/(\d{1,9})(?:[/?#]|$)/);
  if (match) {
    const tokenMatch = text.match(/[?&]t=([^&#]+)/);
    return {
      kind: 'partner',
      id: Number(match[1]),
      token: tokenMatch ? decodeURIComponent(tokenMatch[1]) : null,
    };
  }

  return { kind: 'unknown', raw: text };
}

/** "AB c-12 3" → "ABC123" (codes have no look-alike characters). */
export function normalizePairingCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/** Accepts "192.168.1.20:8000", "https://host" or "https://host/api/" and returns "…/api". */
export function normalizeApiUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  if (!/\/api$/i.test(url)) url = `${url}/api`;
  return url;
}

import * as SecureStore from 'expo-secure-store';

/** What a paired phone remembers, kept in the OS keychain/keystore. */
export interface Session {
  api: string; // e.g. https://lounge.example.org/api
  token: string;
  deviceId: number;
  deviceName: string;
  eventName: string;
}

const KEY = 'blw-scanner.session.v1';

export async function loadSession(): Promise<Session | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export async function saveSession(session: Session): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(session));
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY);
}

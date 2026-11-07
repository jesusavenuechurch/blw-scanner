import { Directory, File, Paths } from 'expo-file-system';
import { api } from './api';
import { partnersNeedingPhotos, partnersWithStalePhotos, setPartnerPhoto } from './db';
import type { Session } from './session';

/** Partner photos live in the app's documents folder so they survive restarts and work offline. */
function photoDir(): Directory {
  const dir = new Directory(Paths.document, 'partner-photos');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export function deletePhotoFile(uri: string | null) {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Already gone.
  }
}

export function deleteAllPhotos() {
  try {
    const dir = new Directory(Paths.document, 'partner-photos');
    if (dir.exists) dir.delete();
  } catch {
    // Nothing to remove.
  }
}

/**
 * Downloads new or changed photos, a few at a time. Returns how many
 * succeeded. Failures are left for the next sync.
 */
export async function syncPhotos(session: Session, onProgress?: (done: number, total: number) => void): Promise<number> {
  for (const stale of await partnersWithStalePhotos()) {
    deletePhotoFile(stale.photo_file);
    await setPartnerPhoto(stale.id, null, null);
  }

  const queue = await partnersNeedingPhotos();
  if (queue.length === 0) return 0;

  const dir = photoDir();
  let done = 0;
  let ok = 0;

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift()!;
      try {
        const target = new File(dir, `${item.id}-${item.photo_version}.jpg`);
        const file = await File.downloadFileAsync(api.photoUrl(session, item.id), target, {
          headers: { Authorization: `Bearer ${session.token}` },
          idempotent: true,
        });
        if (item.photo_file && item.photo_file !== file.uri) deletePhotoFile(item.photo_file);
        await setPartnerPhoto(item.id, item.photo_version, file.uri);
        ok++;
      } catch {
        // Try again on the next sync.
      }
      done++;
      onProgress?.(done, done + queue.length);
    }
  }

  await Promise.all([worker(), worker(), worker(), worker()]);
  return ok;
}

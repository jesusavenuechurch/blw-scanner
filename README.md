# Angel Lounges Scanner

The door app for the Angel Lounge. Ushers scan partners' lounge passes; the app shows the partner's **photo**, name, tier and spouse so the usher can confirm it's really them, and records the check-in.

It works **offline**: the guest list and photos are stored on the phone (SQLite and the app's documents folder), every scan is decided locally, and check-ins upload whenever there's signal.

Built with Expo SDK 54, Expo Router, `expo-camera`, `expo-sqlite` and `expo-file-system`. The server is the `blw` Laravel app (`/api/scanner/v1`).

## How it works

1. **Pair.** In the workspace, open **Scanners → Pair a scanner** and scan the QR code with the app (or type the six-character code and server). The phone gets its own access token, which the workspace can revoke.
2. **Sync.** The app downloads every partner, their QR token and photo, then keeps up to date every 20 seconds while open, when it comes back to the front, and as soon as the network returns:
   - uploads its check-ins (each has a UUID made on the phone, so retries never duplicate),
   - downloads only partners changed since the last sync, plus deletions,
   - downloads check-ins made at other doors, so a repeat visit is noticed at any door,
   - downloads new or changed photos.
3. **Scan.** A pass encodes `…/partner/verify/{id}?t={token}`. The app looks the partner up on the phone and decides:
   - **Welcome**: checked in automatically.
   - **Already checked in today** (at this or another door): the usher can let them in again.
   - **Hasn't finished registering**: the usher can check them in anyway.
   - **This pass doesn't match**: the token is wrong, so the pass may be forged.
   - **Not on the guest list**: if the phone has signal it first asks the server, in case they registered after the last sync.
4. **Guests tab.** Search by name, spouse or church when a pass won't scan, and check the partner in by hand after comparing their face with the photo.
5. **Status tab.** Shows connection, last sync, uploads waiting, photo downloads, recent check-ins, "Sync now", "Download everything again" and "Disconnect".

## Running it

The app uses native modules, so it needs a **development build**; Expo Go won't work.

```bash
npm install
npx eas-cli@latest init        # once: links the project to your Expo account (adds the projectId)
npx eas-cli@latest build --profile development --platform android
npx expo start --dev-client
```

To test against a local server, run the Laravel app so the phone can reach it:

```bash
php artisan serve --host=0.0.0.0 --port=8000
```

Then pair from the workspace on `http://<your-computer's-wifi-ip>:8000`. The pairing QR carries the server address, so nothing needs configuring in the app. `EXPO_PUBLIC_DEFAULT_API_URL` (see `.env.example`) only pre-fills the server when typing a code by hand.

For a shareable APK: `npx eas-cli@latest build --profile preview --platform android`.

## Checks

```bash
npm test             # logic tests (QR parsing, door decisions) with Node's test runner
npm run typecheck
npx expo lint
```

## Code map

| Path | What |
| --- | --- |
| `src/app/pair.tsx` | Pairing screen (scan or type) |
| `src/app/(tabs)/index.tsx` | Scanner and result overlay |
| `src/app/(tabs)/guests.tsx` | Name search and manual check-in |
| `src/app/(tabs)/status.tsx` | Sync status and device actions |
| `src/state/scanner.tsx` | Session, auto-sync, scan resolution, check-ins |
| `src/lib/sync.ts` | One sync pass (upload → partners → other doors → photos) |
| `src/lib/db.ts` | SQLite schema and queries |
| `src/lib/qr.ts`, `src/lib/gate.ts` | Pure logic, unit tested in `tests/` |

Before a store release, change the placeholder bundle ID `com.angellounges.scanner` in `app.json` to one you own.

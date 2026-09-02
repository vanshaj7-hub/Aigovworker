# NN Attendance — Supervisor App

Android app for the ward supervisor of Nagar Nigam Dehradun's sanitation
workforce. The supervisor uses it every morning (and again for the afternoon
shift) to record verified attendance for the workers on their own ward roll.

Built to the eleven approved screen designs, in English and Hindi.

## The eleven screens

| # | Screen | What it does |
|---|--------|--------------|
| 01 | Login & language | Supervisor ID + password, live EN / हिं toggle |
| 02 | First-login profile | Name, mobile, designation; assigned ward shown as read-only |
| 03 | Home | Today's shift progress, four actions, sync state |
| 04 | Select worker | Shift 1 / Shift 2 picker, live geo-fence banner, ward roll with status |
| 05 | Live photo capture | In-app camera, face oval, live face + geo-fence chips |
| 06 | Face match verified | Match score and the full record: worker, ward, shift, time, location |
| 07 | Geo-fence breach | Why it failed, how far outside, what to do, retry |
| 08 | Add worker | One-time onboarding with the reference photograph |
| 09 | Add leave | Type, date range, both-shifts toggle, remarks |
| 10 | History & filters | Month / worker / shift filters, per-shift S1 · S2 status |
| 11 | Offline capture & sync | Queue held on the device, retry sync |

## How attendance works

1. Supervisor signs in and completes their profile once.
2. Picks the shift, then a worker from their ward roll.
3. Captures the worker's photo in the in-app camera.
4. The device checks **location first** — outside the ward geo-fence, the
   record is refused and screen 07 explains why.
5. Inside the fence, the face is detected (ML Kit) and matched against the
   worker's reference template (MobileFaceNet). Below the threshold, the
   record is refused.
6. On a match the record is written locally with time, GPS, supervisor and
   match score, then flushed to the server when the network allows.

Both AI steps run **on the device** — a worker's photograph never has to leave
the phone.

## Two shifts

The ward day is two shifts, and attendance is keyed by
`(worker, date, shift)`, so a worker can be present for one and absent for the
other. Defaults are in `src/domain/shifts.js`:

| Shift | Window |
|-------|--------|
| Shift 1 | 06:00 – 10:00 |
| Shift 2 | 14:00 – 18:00 |

Status resolves to `present` (captured), `leave` (an approved leave covers it),
`absent` (the window closed with nothing captured) or `pending` (still markable).

## Language

Every string lives in `src/i18n/strings.js` in both languages — 139 keys with
full parity. The EN / हिं toggle on the login and home screens swaps the whole
interface live and the choice is remembered.

## The ward geo-fence

A ward is a centre point plus a radius (`src/domain/geo.js`). In the full
system the IT Administrator draws this and the app receives it from the server.

**There is no server in this build**, so the fence is provisioned from a fresh
GPS fix at the moment the supervisor completes their profile. If you are then
outside it, screen 07 offers **"Set this location as the ward centre"** — that
action only appears while the fence came from the device rather than from an
administrator.

## Build

Requirements: Node 18+, JDK 17–21, Android SDK, `minSdkVersion 26`.

```
npm install
cd android
gradlew.bat assembleRelease
```

APK: `android/app/build/outputs/apk/release/app-release.apk`.

Release signing reads `android/keystore.properties` (gitignored — copy
`keystore.properties.example`). Without it, release builds fall back to the
debug key so a clean clone still builds. Keep `reactNativeArchitectures` at all
four ABIs; dropping x86 leaves `libVisionCamera.so` out and the app crashes on
emulators.

Default credentials: **SUP-042 / ward42** (`ACCOUNTS` in `src/storage.js`).

## Verified on an emulator

Screens 01, 02, 03, 04, 05, 08, 09, 10 and 11 were driven and screenshotted on
an Android 15 emulator, including the Hindi toggle, the live face-detection
chip, and the geo-fence inside/outside states.

Screens **06 and 07 could not be exercised there**: both need an enrolled
worker, enrolment needs a real photographic face, and an emulator has none.
ML Kit correctly rejected a synthetic test face. Verify those two on a physical
device.

## Known limitations

- **No backend.** Everything is on the device; `flushQueue` in
  `src/storage.js` marks the queue sent. Point it at the attendance API.
- **No liveness detection.** A printed photograph would pass the face match.
- **Single supervisor account**, held locally.
- **The admin dashboard is not in this app.** Per the designs this build is the
  supervisor role only; the administrative view is the separate web dashboard.
- Clearing app storage erases the profile, workers, records and leaves.

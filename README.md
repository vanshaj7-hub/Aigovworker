# NN Attendance — AI-Powered Workforce Attendance (Supervisor App)

React Native Android app implementing the "AI-Powered Workforce Attendance &
Monitoring System" PRD (Nagar Nigam Dehradun): supervisors verify field
workers by face and record attendance with GPS + timestamp, offline-first.

## What it does

- **Supervisor login** — local credentials (default: `supervisor` / `nagar123`,
  seeded on first launch; change in `src/storage.js`).
- **Worker enrollment** — capture a face photo; the app detects the face
  (Google ML Kit, on-device), crops it, and stores a 192-d MobileFaceNet
  embedding. No photos or biometrics ever leave the device.
- **Mark attendance** — select worker → capture photo → face verified against
  the enrolled embedding (cosine similarity, threshold 0.55 in `src/face.js`)
  → attendance recorded with date/time, GPS location, supervisor identity,
  and match score.
- **Offline-first** — records save locally (AsyncStorage) and are flagged
  `Pending` until connectivity returns (NetInfo listener). The sync step is a
  local stub in `src/storage.js` (`syncPendingRecords`) — point it at your
  backend API when one exists.
- **History & audit trail** — records grouped by date, searchable, with
  per-record GPS/supervisor/match details and CSV export via the share sheet.

The PRD's web admin dashboard is a separate deliverable and is not part of
this app.

## Face recognition pipeline (all on-device)

camera photo → ML Kit face detection → crop face box +20% margin →
resize 112×112 → JPEG decode → normalize → MobileFaceNet (TFLite, bundled at
`src/assets/mobile_face_net.tflite`) → L2-normalized embedding → cosine
similarity vs enrolled embedding.

Model source: `mobile_face_net.tflite` from the open-source
[estebanuri/face_recognition](https://github.com/estebanuri/face_recognition)
project (MobileFaceNet, 112×112 input, 192-d output).

## Build

Requirements: Node 18+, JDK 17–21, Android SDK.

```
npm install
cd android
gradlew.bat assembleRelease
```

APK output: `android/app/build/outputs/apk/release/app-release.apk`.

Release signing reads its credentials from `android/keystore.properties`, which
is **not** in version control. Copy `android/keystore.properties.example` to
`android/keystore.properties` and fill in your own keystore path, alias and
passwords. Without that file, release builds fall back to the debug key so a
clean clone still builds.

The keystore file itself (`*.keystore`) is gitignored. **For production, generate
your own keystore, back it up securely, and never commit it or its passwords** —
losing it means you can no longer ship updates to an already-published app.

## Notes & limitations

- Face matching threshold (0.55) trades off false accepts vs rejects; tune
  `MATCH_THRESHOLD` in `src/face.js` against your field conditions.
- No liveness/anti-spoofing yet — a printed photo could fool it. ML Kit
  classification (eyes-open/smile probability) is a cheap first step.
- Single supervisor account; multi-supervisor + server auth belongs with the
  backend integration.
- All data is device-local. Clearing app storage erases enrollments and
  records.

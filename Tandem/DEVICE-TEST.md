# Device test — v1.1.0 clone build

First hardware run of the bundle. Short version: **the clone installs as its own app, but it does not
launch.** Tandem's licence gate opens Google Play and the process dies inside PairIP's native library.
The same happens to an unpatched copy of the same APK, so the blocker is the app's licensing, not the
rename.

## Setup

| | |
| :--- | :--- |
| Date | 2026-11-04 |
| Device | Samsung SM-S918U (Galaxy S23 Ultra), Android 17 (`CP2A.260605.016`, `S918USQU8GZIF`) |
| ABI / density | `arm64-v8a`; 560 dpi (xxhdpi bucket) |
| Bundle | `v1.1.0`, SHA-256 `0034159ee9a8ba74d7f540f2ca48f5c57cf4d805f68639da575d991e1f5f2af9` |
| Source file | APKMirror universal APKM, 6.38.0 (versionCode 11568) |
| Patches applied | all five: Bypass PairIP checks, Disable Adjust tracking, Force dark mode, Remove ads, Clone package |
| Install artefact | single merged APK, 268,880,129 B, signed `CN=Morphe` (cert SHA-256 `b4085a46…59faca`), `app.xiondigital.tandem` |

Morphe's own pipeline produced the artefact (PATCHING → REBUILDING → SIGNING all reported success), so
this is the file a user gets from the bundle, not a hand-built variant.

## Method

```bash
adb install -r out-clone-full.apk          # Success
adb shell am start -n app.xiondigital.tandem/net.tandem.ui.MainActivity
# observed for 9 s: process presence, resumed activity, logcat (main + crash buffers)
```

## Results

| Check | Result |
| :--- | :--- |
| Installs | **Pass** — `adb install` reports `Success`, package `app.xiondigital.tandem` is listed |
| Separate from the official app | **Pass** — listed alongside `net.tandem`; provider authorities, permission and task affinity followed the new id |
| Stays running | **Fail** — no process 9 s after start (repeatable, 2 runs) |
| Launch screen | **Fail** — splash only, then the Play Store licence paywall comes to the front |
| Reaches Tandem UI / sign-in | **Fail** — never gets past the licence gate |

## Evidence

The paywall is an activity the app process starts; the intent is Play's licence paywall for **the
original** package, not the clone:

```
wm_create_activity: [0,…,com.android.vending/com.google.android.finsky.activities.MainActivityPrivate,
                     android.intent.action.VIEW, NULL, http://play.google.com/…,
                     … startActivityAsUser:app.xiondigital.tandem:-1]
capturedLink=http://play.google.com/store/license/paywall?id=net.tandem
```

Immediately afterwards the process dies with a native fault inside PairIP:

```
am_crash: [2867,0,app.xiondigital.tandem,547896388,Native crash,Segmentation fault,unknown,0,0]
F DEBUG : signal 11 (SIGSEGV), code 2 (SEGV_ACCERR), fault addr 0xb400007d403de000 (read)
F DEBUG : Cmdline: app.xiondigital.tandem
F DEBUG : backtrace:
F DEBUG :       #00 pc 00000000000330c4 …/base.apk!libpairipcore.so (offset 0x533c000)
```

Both the paywall and the fault reference the licence machinery, which is PairIP's
`com.pairip.licensecheck` flow bound to Play's `IBackgroundLicensingService`.

## Control: the same APK without patches

To separate "the patches broke it" from "the app refuses this install", the reference APKM was
installed unmodified on the same device and launched the same way:

```bash
adb install-multiple -r apkm/base.apk apkm/split_config.arm64_v8a.apk apkm/split_config.xxhdpi.apk
adb shell am start -n net.tandem/net.tandem.ui.MainActivity
```

| Check | Patched clone | Unpatched `net.tandem` |
| :--- | :--- | :--- |
| Installs | Pass | Pass |
| Opens Play's licence paywall on launch | Yes | Yes (`MainActivityPrivate`) |
| Process still alive after 9 s | No | No |
| PairIP `libpairipcore.so` in the log | Yes (SIGSEGV) | Yes |

So the gate fires for a sideloaded build regardless of patching. 6.38.0 wants an installation it can
license, and neither a clone id nor the current bytecode stubs satisfy it.

## Why the existing stubs do not stop it

The bundle's **Bypass PairIP checks** replaces `LicenseClient.checkLicense`,
`startPaywallActivity`, `startErrorDialogActivity`, `scheduleAppShutdown` and
`LicenseActivity.onStart()` in the dex. Those replacements *are* in the installed build — Morphe writes
patched classes into a final `classes6.dex`, which contains exactly the edited classes (`LicenseClient`,
`LicenseActivity`, `SignatureCheck`, `TandemApp`, the ad SDK classes, …), and the night-mode injection is
present as expected.

The run still reaches the licence path, and the tombstone points into `libpairipcore.so`. That is the
signature of enforcement happening **below** the patched layer — PairIP's native core and the classes it
decrypts at startup — rather than in the bytecode the patch edits. Emptying the Java methods does not
remove the binding to Play's licensing service, and the native core terminates the process afterwards.

## What this means

- The clone mechanics work: new application id, installs beside the official app, no provider or
  broadcast collisions on the device.
- The bundle is **not usable on hardware yet**: it cannot get past Tandem's licence gate, which is the
  same "Get this app from Google Play" behaviour reported before the clone patch existed.
- Nothing after launch has been observed — sign-in, messaging, dark mode, ad removal, voice notes — so
  none of those can be marked as verified.

## Next

1. Neutralise the licence check at the level that actually runs (PairIP's native core / its decrypted
   path), then repeat this test unchanged.
2. Once a run survives launch, walk the app: sign-in, conversation list, a message, a call, then the
   patch-specific effects.
3. Compare against a **Play-installed** official app; sideloading the stock APK trips the same gate, so
   it is not a usable baseline.

## Note on the official copy

At the start of the test `net.tandem` was installed on the device. After the clone install completed it
was gone from both `pm list packages` and `pm list packages -u`, with no uninstall event captured (the
log buffer was cleared before installing). A package-id change cannot uninstall another package, so this
was an outside agent — most likely Play Protect removing a sideloaded build — or a manual uninstall.
The unpatched control run used a copy reinstalled from the reference APKM; reinstall from Play for a
true baseline.

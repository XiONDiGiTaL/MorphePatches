# TWA wrapper for visualvm

Scaffold only. Nothing here is published, and `assetlinks.template.json` is a
template — it must not be served as-is.

- Package id: `net.xiondigital.visualvm`
- Start URL: `https://xiondigital.net/visualvm/`
- Config: `twa-manifest.json` (read by Bubblewrap from this directory)

## Prerequisites

JDK 17 and the Android SDK (platform 34, build-tools, platform-tools for adb):
`bubblewrap doctor` reports anything missing.

```
npm i -g @bubblewrap/cli
bubblewrap doctor
```

## Build

Run from this directory so Bubblewrap picks up `twa-manifest.json`:

```
cd visualvm/twa
bubblewrap build
```

The first build asks for the keystore at `./android.keystore` (alias `android`)
and creates it if it is missing; it then writes `app-release-signed.apk` and
`app-release-bundle.aab`. The keystore and both artifacts are git-ignored —
keep the keystore, never commit it, and back it up. Losing it means the app can
only be updated by uninstall/reinstall.

To create the keystore yourself instead:

```
keytool -genkeypair -v -keystore android.keystore -alias android \
  -keyalg RSA -keysize 2048 -validity 10000
```

## Install and check on the phone

```
adb install -r app-release-signed.apk
adb shell am start -a android.intent.action.VIEW -d "https://xiondigital.net/visualvm/"
adb shell pm get-app-links net.xiondigital.visualvm
```

`get-app-links` reporting `verified` is the difference between the app opening
fullscreen and it opening in a Custom Tab with the URL bar visible.

## Asset links (do this after the site is live, not before)

Take the fingerprint from the keystore that actually signed the APK:

```
keytool -list -v -keystore android.keystore -alias android | grep SHA256
```

Copy `assetlinks.template.json`, replace the placeholder with that value
(uppercase hex, colon-separated, e.g. `AB:CD:...:EF`), and serve the result at
`https://xiondigital.net/.well-known/assetlinks.json`.

That file is additive: it is an array of statements, so other TWAs on the same
domain append their own entry rather than replacing it. If the APK is ever
re-signed (Play App Signing, a different keystore), the fingerprint in that file
must change to the one that signed the delivered build, or verification breaks
and the app silently falls back to a Custom Tab.

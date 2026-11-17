# TWA wrapper for visualvm

- Package id: `net.xiondigital.visualvm`
- Start URL: `https://xiondigital.net/visualvm/`
- Config: `twa-manifest.json` (read by Bubblewrap from this directory)

Scaffold only. Nothing here is published, and `assetlinks.template.json` is a
template that must not be served as-is.

## Prerequisites

JDK 17 and the Android SDK (platform 34, build-tools, platform-tools for adb).
`bubblewrap doctor` reports anything missing.

```
npm i -g @bubblewrap/cli
bubblewrap doctor
```

## 1. Create the signing key first

**This step is required. `bubblewrap build` does not create a keystore.**
Keystore creation only happens inside `bubblewrap init`, which this scaffold
skips by supplying `twa-manifest.json` directly. `build` reads
`signingKey.path` from the manifest and hands that file to `apksigner`; if the
file is absent, the build fails while signing the APK.

```
cd visualvm/twa
keytool -genkeypair -v -keystore android.keystore -alias android \
  -keyalg RSA -keysize 2048 -validity 10000
```

A relative `signingKey.path` resolves against the directory you run
`bubblewrap` in, which is why the commands below run from this folder.

Note the keystore and key passwords. `bubblewrap build` prompts for them, or
reads `BUBBLEWRAP_KEYSTORE_PASSWORD` and `BUBBLEWRAP_KEY_PASSWORD` from the
environment when both are set.

## 2. Build

```
cd visualvm/twa
bubblewrap build
```

The first run notices that the Android project has not been generated yet and
asks whether to create it; accept, and it writes `manifest-checksum.txt` plus
the Gradle project. It then produces `app-release-signed.apk` and
`app-release-bundle.aab`.

The keystore and both artifacts are git-ignored. Keep the keystore and back it
up: losing it means the app can only be updated by uninstalling and reinstalling.

## 3. Install and check on the phone

```
adb install -r app-release-signed.apk
adb shell am start -a android.intent.action.VIEW -d "https://xiondigital.net/visualvm/"
adb shell pm get-app-links net.xiondigital.visualvm
```

`get-app-links` reporting `verified` is the difference between the app opening
fullscreen and it opening in a Custom Tab with the URL bar visible.

## 4. Asset links (after the site is live, not before)

Take the fingerprint from the keystore that actually signed the APK:

```
keytool -list -v -keystore android.keystore -alias android | grep SHA256
```

Copy `assetlinks.template.json`, replace the placeholder with that value
(uppercase hex, colon-separated, for example `AB:CD:...:EF`), and serve the
result at `https://xiondigital.net/.well-known/assetlinks.json`.

That file is an array of statements, so other TWAs on the same domain append
their own entry rather than replacing it. If the APK is ever re-signed (Play App
Signing, a different keystore), the fingerprint must change to the one that
signed the delivered build, or verification fails and the app silently falls
back to a Custom Tab.

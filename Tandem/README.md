# Tandem

Patches for **Tandem: Language exchange** (`net.tandem`) by XiONDiGiTaL, built for
[Morphe](https://morphe.software).

| | |
| :--- | :--- |
| Bundle | [`patches.mpp`](patches.mpp) — 28,538 bytes, `sha256 fd58ab8ddf5b2ef83ff438be287306bd882193489486dc52ff274764c4883749` |
| Supported app | Tandem **6.38.0** (versionCode **11568**), `net.tandem`, minSdk 32, targetSdk 37 |
| Required patcher | Morphe patcher **2.1.0** (bundles declare `Patcher-Version: 2.1.0`) |
| Status | **Experimental** — builds, loads and patches 6.38.0; not yet run on a device |

Add [`patches.mpp`](patches.mpp) in Morphe Manager (or Desktop) and patch your stock Tandem 6.38.0
file. Nothing else is distributed here.

---

## Patches

### Force dark mode

**What it does.** Tandem already contains a dark theme, but the only way in is the system-wide
dark-mode setting — the app has no appearance setting of its own. This patch turns Tandem's own dark
theme on for Tandem alone, whatever the system setting is, and leaves other apps and the system
setting untouched.

**Why this is the right lever for this build.** Verified against Tandem 6.38.0:

| Evidence | Where |
| :--- | :--- |
| Base theme is a DayNight theme | `BaseAppTheme` → `Theme.Material3.DayNight.NoActionBar` (`res/values/styles.xml`) |
| A real night overlay ships with the app | `res/values-night/styles.xml` flips `android:isLightTheme` to `false`; `res/values-night/colors.xml` remaps design tokens (`background` → `dark1`, `fontPrimary` → `light1`, …) |
| Compose follows the same switch | Tandem's Compose theme builds its own `Configuration`, sets `uiMode = (uiMode & ~0x30) \| 0x20` for dark, and applies it through a `ContextThemeWrapper` |
| The app never forces light or dark itself | no `AppCompatDelegate.setDefaultNightMode(...)` in Tandem's own code |
| App-level night mode exists on this build | manifest `minSdkVersion` 32; `UiModeManager.setApplicationNightMode` exists from API 31 |

**How.** One platform call is injected at the start of `net.tandem.TandemApp.onCreate()`:

```smali
const-string v0, "uimode"
invoke-virtual {p0, v0}, Landroid/content/Context;->getSystemService(Ljava/lang/String;)Ljava/lang/Object;
move-result-object v0
check-cast v0, Landroid/app/UiModeManager;
const/4 v1, 0x2                     # UiModeManager.MODE_NIGHT_YES
invoke-virtual {v0, v1}, Landroid/app/UiModeManager;->setApplicationNightMode(I)V
```

`Application.onCreate()` runs once per process, before the first activity resolves a theme or a
Compose palette, so every screen starts in Tandem's own night configuration. No theme, colour,
activity, layout or resource is renamed, replaced or deleted, so media, user images, icons, dialogs
and system bars keep using Tandem's own night resources. Nothing is force-inverted.

**Why `TandemApp`.** The manifest declares `com.pairip.application.Application` (the PairIP wrapper),
which extends `net.tandem.TandemApp` and only overrides `attachBaseContext` for its integrity and
licence checks. `onCreate` is inherited unchanged, so the anchor is neither obfuscated nor inside the
PairIP wrapper, and PairIP is left intact.

---

## Tandem Pro: what is client-side and what is not

This was investigated properly for 6.38.0, because "unlock Pro locally" is only possible if the
client decides it. It does not.

Every Pro-dependent value in this build arrives **inside a server response**, not from local state:

| Server-delivered model | Field |
| :--- | :--- |
| `net.tandem.kmp.sdk.core.remote.DecodedPayloadAttrs` | `net.tandem.core.users.attributes.isPro` |
| `ProfileVisitorsProps` | `isUserPro`, `visitorsLimit` |
| `ViewedProfilesProps` | `isUserPro` |
| `ChatListProps` / `ChatListEntity` | `isUserPro` |
| `ConversationLimitProps` | `isPro` |
| `PresenceStateInternal` (realtime) | `isPro` |
| `Success(visitors=…, isUserPro=…)` (profile-visitors endpoint result) | `isUserPro` |

There is **no locally persisted Pro flag** to switch: a search of the app's storage and preference
keys finds none, and the only "pro status" writer in the client is the JS bridge event
`set_pro_status`, which the app receives from its own web content. Profile visitors are not a hidden
client list either — they are returned by a profile-visitors endpoint that itself answers with
`isUserPro` and `visitorsLimit`.

Consequences, stated plainly:

- **Nothing client-side can be "enabled" for Pro.** Flipping a UI boolean would leave the app asking
  servers that still answer "not Pro", still send no visitor list, and still report limits reached.
- **Making visitors appear would mean forging the server's answer** — rewriting entitlement and
  limit fields in network payloads. That is tampering with the service's entitlement decisions, not
  a client-side behaviour change, so it is not implemented here. It is also the one thing that would
  reliably break Tandem's own consistency checks (PairIP is active and untouched).
- **Billing, authentication and entitlement handling are untouched.** No patch here reads, writes,
  fakes or re-routes Google Play Billing, purchase state, JWT/session data or entitlement.

So: Pro features, profile visitors included, are **not implemented — technically blocked by
server-side entitlement**, not by preference.

### How a working 6.11.1 "Premium" mod did it

A Tandem 6.11.1 build distributed as "Premium (Mod by ElaMods)" (`sha256
3b387e5f65c1a1ac3f0c2916183348c2273262cb2bc96c200922dd914cfe5d19`, 255 MB) was decompiled for
comparison. It contains exactly two kinds of change, and neither touches the server:

1. **MT Manager's ApkSignatureKiller.** An injected 17 KB `classes6.dex` holding
   `bin/mt/signature/KillerApplication`, plus `assets/SignatureKiller/origin.apk` and a native
   `libsigner.so`. It makes the re-signed APK report the original app signature. (6.11.1 has no
   PairIP; the 6.38.0 build discussed above does.)
2. **Five getters forced to `return true`**, each still reading its field first — the signature of a
   hand edit that swaps the return register for `const/4 v0, 0x1`:

   | Class | Method | Field |
   | :--- | :--- | :--- |
   | `net.tandem.core_new.models.MyProfile` | `isPro()` | `isPro` |
   | `net.tandem.core_new.models.UserProfile` | `isPro()` | `isPro` |
   | `net.tandem.kmp.sdk.presence.states.PresenceStateInternal` | `isPro()` | `isPro` |
   | `net.tandem.parties.core.models.LocalMember` | `isPro()` | `isPro` |
   | `net.tandem.pro_core.models.Product` | `isLifetime()` | `isLifetime` |

What it deliberately leaves alone matters just as much: `MyProfileMetaData.isPro()`
(language-change limits), `Visitor.isPro()`, `ConversationLimitProps.isPro()`,
`NewRoomState.isProUser()` and `MyLanguagesState.isPro()` still return the server's value.

The effect is that the app *believes* the account is Pro — Pro badge, Pro-only UI such as the city
filter, purchase/deeplink screens — while every quota and every server-answered question still comes
back as non-Pro. That is the entire technique, and it is exactly why such a mod cannot deliver
profile visitors: the visitor list is a server response, not a local flag.

## Ads

- The client bundles **AdMob** (`com.google.android.gms.ads`, app id `ca-app-pub-…`), **AppLovin MAX**
  (`com.applovin`, with its mediation debugger activities) and **Meta Audience Network**
  (`assets/audience_network/*.dex`).
- Ad placement logic lives in Tandem's own **obfuscated** classes (`defpackage`), and renamings change
  between releases, so there is no stable, version-safe anchor to hook in a 6.38.0-only patch.
- Ads are also tied to the entitlement above: the app's own Pro upsell reads *"Remove ads and enjoy
  Language Parties completely distraction-free."* and *"Remove ads and continue connecting with
  members distraction-free."* Removing ad rendering would therefore produce a paid benefit without
  the purchase, i.e. the same server-side problem as Pro.
- No client-side "ads off" switch or remote-config key for ad display was found in the 6.38.0 code.

Ad handling is therefore **not implemented**; the ad SDKs are left fully intact and the investigation
is recorded here rather than guessed at.

---

## Supported versions

| Version | Version code | File type | Status |
| :--- | :--- | :--- | :--- |
| 6.38.0 | 11568 | APKM bundle (base + ABI/density splits) | Inspected, patched, **not device-tested** |
| 6.38.0 | 11568 | Single APK (`base.apk`, or a universal build of the same version) | Same patch, **not device-tested** |

Reference file: APKMirror universal bundle `sha256 17539cc675654353e5971a8fd2bea6384876c71f63b387f8d95ef6cf7502e3ca`
(`base.apk` `sha256 940797a624210ba555fc0e67e9b7ce9456c4dd811450d4e973ac716ee721942b`). Package
metadata: `net.tandem`, versionName `6.38.0`, versionCode `11568`, minSdk 32, targetSdk 37,
compileSdk 37.

No other version is claimed. The compatibility declaration lists only 6.38.0, so Morphe refuses to
apply the bundle to another version instead of silently patching it. Adding a version is a claim that
the fingerprint and injected code were verified against that exact build.

## Build

```bash
# JDK 21, from the repository root
./gradlew :patches:buildAndroid
# -> patches/build/libs/patches-*.mpp   (copy over Tandem/patches.mpp when it changes)
```

The Morphe Gradle plugin is published only to GitHub Packages, which needs credentials even for
public packages: export `GITHUB_ACTOR` and a `GITHUB_TOKEN` with `read:packages`, or set
`gpr.user` / `gpr.key` in `~/.gradle/gradle.properties`.

`./gradlew :patches:generatePatchesList` regenerates `patches-list.json` from the built bundle;
releases do this automatically via semantic release on `main`/`dev`.

## Install

1. Use Tandem **6.38.0** (versionCode 11568).
2. In Morphe Manager, import [`patches.mpp`](patches.mpp) (or the bundle you just built).
3. Select your Tandem file, enable **Force dark mode**, patch, install.
4. The patched build is signed differently from the store build, so remove the stock app first and
   keep your login details handy.

## Requested features and what the APK can support

The full feature list proposed for this patch (media tools, study workflow, speech tools, Pro
targets) is triaged feature by feature against the 6.38.0 code in [ROADMAP.md](ROADMAP.md): what a
dex patch can deliver, what needs new app code, and what is server-authoritative.

## Known limitations

- **Not device-tested.** The bundle compiles, loads through Morphe's loader, and applies to the real
  6.38.0 dex files, but nobody has looked at the result on a screen yet.
- **No in-app toggle.** The patch is on/off at patch time; a toggle would need a real settings
  destination and a persisted preference in Tandem's own settings architecture.
- **Only night-aware UI changes.** Screens, WebViews or ad creatives that ignore `uiMode` look the
  same as they do today with system dark mode on.
- **Single known-good version**, by design.
- **PairIP stays on.** A patched build may still be refused by Tandem's integrity checks; that risk
  is inherent to patching this app and is not worked around.

## Testing status

| Check | Result |
| :--- | :--- |
| Kotlin compiles against patcher 2.1.0 | Pass |
| `:patches:buildAndroid` produces the bundle | Pass |
| Bundle loads via Morphe's `loadPatchesFromJar` | Pass |
| Metadata identifies `net.tandem`, 6.38.0, minSdk 32 | Pass |
| Patch applies to the real 6.38.0 `base.apk` (fingerprint match + dex assembly) | Pass |
| Injected call present in the compiled patched dex | Pass — the patched dex decompiles to `((UiModeManager) getSystemService("uimode")).setApplicationNightMode(2)` as the first statement of `onCreate()`, before `super.onCreate()` |
| Unsupported versions rejected | Pass by construction — only 6.38.0 is declared |
| Dark mode correct on major screens, dialogs, navigation | **Not tested** — no device or emulator available |
| Login, messaging, language exchange, settings, billing unaffected | **Not tested** — same reason |

The last two rows decide whether this is usable; until they are confirmed on a device the patch stays
experimental.

## Compatibility warnings

- Do not apply to any Tandem build other than 6.38.0, and do not force a version mismatch.
- Do not combine with another Tandem patch that injects at `Application.onCreate()`.
- Signing the patched result changes the signature; store updates will not apply over it.

## A note on the older ELAmods Tandem patch

The older ELAmods Tandem patch was treated as historical reference only and **no code from it was
copied**. A 6.11.1 build carrying that name was decompiled in November 2026 and is analysed in
[How a working 6.11.1 "Premium" mod did it](#how-a-working-6111-premium-mod-did-it); it is a
different app version and none of its code, smali or technique is used here. This repository's history contains no ELAmods source for Tandem: the folder previously held
one scaffold (`Tandem/dark-mode/DarkModePatch.kt`, an empty `execute` block with a `TODO` fingerprint)
and a placeholder file. The fingerprints, injected code and compatibility declaration here were
derived from inspecting Tandem 6.38.0 itself. The scaffold's idea — a bytecode patch that turns the
theme dark — is kept; its structure is not relied on.

## Changelog

- **Unreleased** — `Force dark mode` for Tandem 6.38.0 (APKM and APK) is working and verified against
  the real APK; the empty scaffold is gone. Shared compatibility declarations and the
  `TandemApp.onCreate` fingerprint added. Pro, profile visitors and ads investigated and documented
  above: server-side entitlement, so not implemented. Prebuilt bundle checked in at `patches.mpp`.
- **Unreleased** — ELAmods' 6.11.1 "Premium" build decompiled for comparison: its unlock is five
  forced `isPro` / `isLifetime` getters (signature-killed APK, no PairIP at that version), leaving all
  server-side limits intact. Recorded above; no code borrowed from it.

## Back to the collection

[../README.md](../README.md)

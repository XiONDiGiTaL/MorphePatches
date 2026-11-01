# Tandem patch roadmap: what the APK can and cannot support

This file answers one question for every requested feature: **can a `.mpp` deliver it on Tandem
6.38.0, and if not, why not?** Verdicts are based on the 6.38.0 bundle in this repository's
compatibility list (`net.tandem`, versionCode 11568), decompiled with jadx and read class by class.

## How a patch differs from an app

A Morphe patch is a **bytecode and resource patcher for an APK that already exists**. It can rewrite
the body of an existing method, inject instructions at a chosen point, replace a constant or an enum
value, and patch resources or manifest attributes. It runs at build time against the original dex and
produces a modified APK.

It cannot add new screens, layouts, view models, databases, background services, network clients,
bundled models or permissions-gated flows. Every feature that needs a new user-facing surface is
therefore not a patch: it is new app code that would have to ship separately.

That split — not difficulty — is what decides the verdicts below.

## Evidence from the 6.38.0 bundle

| Observation | Evidence | Consequence |
| :--- | :--- | :--- |
| App logic is R8-obfuscated | 28,616 classes in `defpackage/` against 480 readable classes under `net/tandem/` | Few stable semantic anchors; each patch needs fingerprinting by strings/structure, not by name |
| UI is Compose with XML hosts | Compose call sites throughout `defpackage/`, XML themes and layouts in `res/` | New controls mean new composables — patcher territory only for existing call sites |
| Local Room databases **do** exist | `net/tandem/translation/core/local/room/TranslationDataBase`, `net/tandem/coreui_new/database/TranslationDatabase` (`user_translations`), `net/tandem/clubs/ui/database/ClubsDatabase` | A patch can read cached translations; it cannot add tables or a store of its own |
| No `android.speech.tts.TextToSpeech` anywhere | Full-tree search, zero hits | Every text-to-speech and pronunciation feature needs new code and a speech engine |
| Ads are AppLovin MAX + AdMob mediation | `com.applovin.mediation.MaxRewardedAdListener`, `com.google.ads.mediation.admob.AdMobAdapter`, `R.drawable.admob_close_button_*`, `"INTERSTITIAL"`/`"APP_OPEN"`/`"REWARDED"` format strings | Ad rendering is client-side and separable from billing |
| Ads are gated by an intent extra | `UserProfileActivity` reads `EXTRA_SHOW_INTERSTITIAL_AD_TRIGGER` (written in `toj`) | A single boolean gate exists for the interstitial path |
| Profile visitors are a server payload | `defpackage/q7g` references `profileVisitors/entities/ProfileVisitorsProps`; `defpackage/ukt` holds `visitorsList` | No local visitor list to display, however the client is patched |
| Saved-expression and translation limits come from server props | `ExpressionsRemoteConfig(freeMaxExpressionsLimit=…)`, `LimitReached(freeExpressionsLimit=…)`, `"expressionLimit=250, translationLimit=500, noteLimit=500"` | Limits are server-authoritative; local edits only desynchronise the UI |
| Voice capture uses platform recorders; playback has no plain `MediaPlayer` anchor | `MediaRecorder`/`AudioRecord` in obfuscated wrappers, `setPlaybackSpeed` only in the Agora SDK and the certificate-exam `ListeningFragment` | Playback-speed work requires tracing the obfuscated player first |

## 1. Media and conversation utilities

| Feature | Verdict | Reason |
| :--- | :--- | :--- |
| Voice Note Downloader | **New code** | Needs a file write, a MediaStore insert and a save action in the message UI; the patch has no surface to attach it to |
| Voice Note Playback Controls | **Partly patchable** | A *default* speed is a one-method change once the player is traced. The 0.75×–2× menu needs a new UI control |
| Voice Note Transcription | **New code + external service** | No on-device ASR in the APK; would mean bundling a model or calling a service, neither of which a dex patch can do |
| Voice Note Translation | **New code + external service** | Builds on transcription above |
| Photo Saver | **New code** | Same problem as the voice-note downloader: needs a save path and a UI entry point |
| Image Viewer Enhancements | **New code** | Zoom/rotate/save/open-in-gallery are all new interaction code |
| Message Exporter | **New code** | Needs a file writer, a format serialiser and a selection UI |
| Conversation Search | **New code** | History is fetched from the server page by page; only translations are cached locally, so there is no complete local corpus to search |
| Copy Message | **New code** | Requires editing an existing message action menu built in Compose |
| Media Gallery | **New code** | Needs its own index and screen |

Nothing in this group is a mislabelled patch: each one is a small app in its own right.

## 2. Language-learning enhancements

Every item in this section — local saved expressions, save-as-flashcard, automatic vocabulary
capture, spaced repetition, cloze cards, phrasebook, vocabulary statistics, grammar explanation,
correction comparison, correction history, naturalness checker, register detector, idioms, sentence
breakdown, word-form explorer, language toggle — is **new code**: a local store, an algorithm and a
UI. Tandem has no hook that a dex patch can extend into a study workflow.

Two items are worth separating out because their *tempting* version is the wrong one:

- **Unlimited Local Saved Expressions.** The honest implementation is a separate local collection,
  which is new code. The tempting implementation — editing `freeMaxExpressionsLimit` or forcing the
  entitlement — does not create local storage, it just lies to the running client about a
  server-enforced quota, and the server refuses the write anyway.
- **Correction History.** Corrections arrive as ordinary messages, so a local record means new
  storage; the messages themselves remain on the server.

## 3. Speaking and pronunciation tools

All of them — text-to-speech, pronunciation practice, listen-and-repeat, audio loop, transcript
alignment, pronunciation notes, shadowing, bookmarks — depend on two things the APK does not contain:
a TTS engine binding (absent, see the evidence table) and word-level timestamps in the audio payload.
**New code plus a speech service**, and the caveat in the request is the correct one: recognition
accuracy is not pronunciation assessment, and nothing here should claim scores it cannot produce.

## 4. Innovative language-learning features

Conversation-to-lesson, personal language memory, partner-specific vocabulary, conversation replay,
exchange timer and translation comparison are **new code plus, in several cases, an external
model**. They are good ideas, and they belong in a companion app that reads exported conversation
data — with explicit consent per conversation, which is also the correct answer to the request's own
warning about silently uploading private messages.

## 5. Client-side Pro feature targets

| Target | What the APK shows | Verdict |
| :--- | :--- | :--- |
| Profile Visitors | `ProfileVisitorsProps` arrives from the server with the visitor list and a Pro flag | **Server-authoritative** |
| Audio Transcription | no client ASR; Pro transcription is a service call | **Server-authoritative** |
| Saved Expressions | limit arrives as `freeMaxExpressionsLimit`; refusal is server-side | **Server-authoritative** |
| AI Toolkit | UI exists, work is done remotely against an authenticated account | **Server-authoritative** |
| Multiple Learning Languages | account data model, not a local list | **Server-authoritative** |
| Translation Limits | `translationLimit` in server props | **Server-authoritative** |
| Ad Removal | AppLovin MAX and Meta Audience Network request the ads; the community slot renders `CommunityAdConfig("ca-app-pub-4507927355231659/3667237836", …)` | **Shipped** — see below |

On the last row: ad delivery is decided by the client, not by the account. The community slot is one
composable and the SDKs' `loadAd` methods are kept-name anchors, so both are patchable without
touching billing or entitlement — which is different in kind from forging an `isPro` answer, since it
only drops third-party ad requests. Rewarded formats, which the user opens deliberately, are left
alone.

## What this repository will actually ship

Only items where the change lives inside a method that already exists:

| Patch | Status | Notes |
| :--- | :--- | :--- |
| Bypass PairIP checks | **Shipped** | `SignatureCheck.verifyIntegrity` and `LicenseClient.checkLicense` reduced to `return-void`; required for any re-signed build to start |
| Force dark mode | **Shipped** | `UiModeManager.setApplicationNightMode(2)` at `TandemApp.onCreate()` |
| Disable Adjust tracking | **Shipped** | `Adjust.initSdk(AdjustConfig)` reduced to `return-void`; 246-class attribution SDK never initialises |
| Remove ads | **Shipped** | Community-ad composable plus the AppLovin MAX and Meta Audience Network `loadAd` methods reduced to `return-void`; rewarded formats untouched |
| Default voice-note playback speed | Candidate | Requires tracing the obfuscated player; a fixed speed, not a menu |

Everything else on the requested list needs its own application, not a patch.

## Recommended next step

Build the study features as a companion Android app that imports conversation data the user
explicitly exports, stores it locally, and implements the flashcard, spaced-repetition, history and
review features there. That keeps the `.mpp` doing what a patcher is good at — small, surgical
changes to Tandem's own behaviour — and puts the parts that need storage, screens and algorithms
where they can actually be built and tested.

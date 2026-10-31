# Tandem

Patch work for Tandem (`net.tandem`), by XiONDiGiTaL.

## Status

- Dark mode: work in progress, **not released, not tested, no bundle yet**
- Supported versions: none verified
- There is currently nothing to install from this folder

This folder contains **dark-mode work only**. It does not contain,
and is not a route to, Pro / paid-feature unlocks or ad removal.

## What is here

- [`../patches/src/main/kotlin/app/xiondigital/patches/tandem/darkmode/DarkModePatch.kt`](../patches/src/main/kotlin/app/xiondigital/patches/tandem/darkmode/DarkModePatch.kt) — a Morphe
  `bytecodePatch` scaffold for Tandem, following the structure of the
  [Morphe patches template](https://github.com/MorpheApp/morphe-patches-template).
  Its theme fingerprint is still **TBD**: the stock Tandem APK has not been
  inspected in this commit, so the patch must not be built or released yet.

## How this becomes a real patch

1. Take a stock Tandem APK for one specific, recorded version.
2. Decompile it and find how Tandem initialises its theme — for example
   whether it uses AppCompat night mode, a custom theme flag, or a
   per-activity theme call.
3. Replace the `TODO` fingerprint in `patches/src/main/kotlin/app/xiondigital/patches/tandem/darkmode/DarkModePatch.kt` with a fingerprint
   that matches that exact method (strings, signature, and opcodes), and
   add the matching theme-forcing instruction.
4. Build the bundle locally and test it with Morphe Desktop on that exact
   app version, on a device, before any release.
5. Only after a tested version exists should a bundle be released and a
   Morphe Manager source link be added to the main README.

Until step 4 is done, do not present this folder as an installable patch.

## Main README

Back to the collection: [../README.md](../README.md)

## Building a .mpp bundle

This repo is now a standard Morphe patches project, like hoo-dles:

- Build locally (requires Java 21 and the Morphe registry access used by
  the template): `./gradlew :patches:buildAndroid`
- The bundle is `patches/build/libs/patches-*.mpp`
- A release is only created by semantic release on `main`/`dev` for
  `feat:`/`fix:` commits. A `chore:`/`docs:` commit, like this structure
  change, only verifies that the project compiles in GitHub Actions —
  it does not publish a bundle.

Do not release a bundle until the dark-mode fingerprint is added and
tested on a recorded Tandem version.

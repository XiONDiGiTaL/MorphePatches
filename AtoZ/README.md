# Amazon A to Z — Force dark mode

A universal Morphe patch for **Amazon A to Z** (`com.amazon.atozm`). It turns the app dark regardless
of the phone's theme, on **any version** of the app.

| | |
|---|---|
| Patch | `Force dark mode` |
| Package | `com.amazon.atozm` |
| Versions | any (no version list — the patch is offered for whatever build you supply) |
| Input | APK (`arm64-v8a` for a 64-bit-only phone such as the Galaxy S25 Ultra) |
| Default | enabled |
| Verified against | 6.0.5098.0 (60050982), and the same anchors exist in 6.0.3553.0, 6.0.2988.0 and 6.0.2065.0 |

## Why the app needs a patch for this

A to Z is React Native on Expo, and its UI is painted from a ~119 MB Hermes bundle that has no dark
palette — `colorScheme`, `useColorScheme` and `darkMode` do not occur in the bundle of any inspected
build. There is no source to recompile and no in-app appearance setting, so no theme can be selected
by hand either.

The only mechanism that reaches JS-painted pixels is Android's own automatic dark transform ("Force
Dark"), and AOSP gates it in `ViewRootImpl.updateForceDarkMode()` on three things:

1. `Theme_forceDarkAllowed` — defaults to `false` on retail builds unless the theme opts in.
2. `Theme_isLightTheme` — the transform is skipped when the theme reports a dark theme, which is
   exactly what `Theme.AppCompat.DayNight` reports once night mode is on.
3. `getConfiguration().uiMode & UI_MODE_NIGHT_MASK == NIGHT_YES` — the app's own night mode.

The patch satisfies all three.

## How the patch works

### Theme resources (hidden dependency)

Every `AppTheme*` style in the APK's decoded `res/values*/styles.xml` gets
`android:forceDarkAllowed=true`, and a `Theme.AppCompat.DayNight(.…)` parent is reparented to
`Theme.AppCompat.Light(.…)`. The reparenting looks backwards but is the point: a DayNight theme
switches the transform **off** in night mode, so the Light variant is what keeps it on.

The patch edits the values files the APK already has instead of writing a `values-night` overlay. A
style defined for a configuration replaces the whole style for that configuration rather than merging
into the base one, so a partial overlay would drop the parent theme and every other item.

If no `AppTheme*` style or no `res/values*/styles.xml` is present, the patch aborts with a message
saying so instead of shipping a build that looks patched and is not.

### Night mode (bytecode)

`AppCompatDelegate.setDefaultNightMode(MODE_NIGHT_YES)` is injected at the top of
`com.amazon.atozm.MainApplication.onCreate()`:

```smali
const/4 v0, 0x2
invoke-static {v0}, Landroidx/appcompat/app/AppCompatDelegate;->setDefaultNightMode(I)V
```

`onCreate()` runs once per process, before any activity exists. `com.amazon.atozm.MainActivity` is a
`ReactActivity` extending `AppCompatActivity`, so AppCompat owns the activity's `Resources`
configuration — the object `ViewRootImpl.getConfiguration()` reads — and applies night mode at
`attachBaseContext2`, before the window is created.

`v0` is dead at entry: the method is a no-argument instance method, so `p0` is its only parameter
register. The patch checks the method's register count and refuses to inject if that ever stops being
true, rather than overwriting `this`.

## What stays untouched

Only two things change, and neither is code the app ships in its UI bundle:

- `res/values*/styles.xml`, where two style items are added;
- `MainApplication.onCreate()`, where three instructions are prepended.

In the 6.0.5098.0 run this came to **1 of 10,884 classes** made mutable and **1,325 values in 16
files** re-encoded. The manifest, the application id, the JS bundle, every other dex and every native
library are left as they were — the patch does not rename the app, so it replaces the installed
A to Z rather than sitting beside it. For a clone, patch the APK and change the package id yourself;
that is a separate job with its own provider-authority and permission consequences.

## Applying it

In Morphe Manager, add this repository as a source (or import the release bundle), select your
A to Z APK and keep **Force dark mode** enabled.

From the CLI:

```bash
java -jar morphe-desktop.jar patch \
  --patches=patches.mpp \
  --exclusive -e "Force dark mode" \
  your-atoz.apk
```

## Testing status

**Experimental.** The patch has been applied with Morphe's own engine to the real
6.0.5098.0 `arm64-v8a` APK and the result was decompiled:

- the engine reported 1 class changed and the resource files re-encoded;
- `MainApplication.onCreate()` decompiles to the injected `const/4 v0, 0x2` +
  `AppCompatDelegate.setDefaultNightMode` **before** `invoke-super`, in a method with `.locals 13`;
- `res/values/styles.xml` decompiles to `android:forceDarkAllowed=true` on both `AppTheme` and
  `AppTheme.Launcher`, with the launcher parent reparented from `DayNight` to `Light`;
- the manifest still declares `com.amazon.atozm`.

It has **not** been run on a device. The rendered result is therefore unverified, and the usual Force
Dark caveats apply: images and avatars are transformed along with everything else, so photos may look
dimmed. If the app is ever updated to a build whose themes or `MainApplication` change shape, the
patch fails loudly instead of silently doing nothing.

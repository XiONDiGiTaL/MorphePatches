package app.xiondigital.patches.tandem.darkmode

import app.morphe.patcher.patch.ApkFileType
import app.morphe.patcher.patch.AppTarget
import app.morphe.patcher.patch.Compatibility
import app.morphe.patcher.patch.bytecodePatch

/**
 * Tandem — Dark mode (WORK IN PROGRESS, DO NOT RELEASE).
 *
 * Target: Tandem, package `net.tandem`.
 * Supported versions: none verified yet.
 *
 * This is a scaffold only. The stock Tandem APK has not been inspected
 * in this commit, so no theme fingerprint has been determined yet.
 * A fingerprint must be added — matching Tandem's actual theme
 * initialisation in one specific, recorded app version — and the patch
 * must be built and tested with Morphe Desktop before any release.
 *
 * This patch is dark-mode work only. It does not unlock Pro / paid
 * features and does not remove ads.
 */
private val COMPATIBILITY_TANDEM = Compatibility(
    name = "Tandem",
    packageName = "net.tandem",
    apkFileType = ApkFileType.APK,
    targets = listOf(
        // No version is confirmed working yet. Add one AppTarget per
        // version that has actually been tested, e.g.:
        // AppTarget(version = "X.Y.Z")
    ),
)

@Suppress("unused")
val darkModePatch = bytecodePatch(
    name = "Dark mode",
    description = "Force a dark theme in Tandem. Work in progress — fingerprint TBD, not tested.",
    default = true,
) {
    compatibleWith(COMPATIBILITY_TANDEM)

    execute {
        // TODO: Add a Fingerprint for Tandem's theme initialisation here,
        // then add the instruction that forces dark / night mode.
        // Until that fingerprint exists, this patch does nothing and
        // must not be included in a released bundle.
    }
}

package app.xiondigital.patches.tandem.integrity

import app.morphe.patcher.extensions.InstructionExtensions.addInstructions
import app.morphe.patcher.patch.bytecodePatch
import app.xiondigital.patches.tandem.shared.Constants.COMPATIBILITY_TANDEM_APK
import app.xiondigital.patches.tandem.shared.Constants.COMPATIBILITY_TANDEM_APKM

/**
 * Lets a patched, re-signed Tandem build start at all.
 *
 * Tandem 6.38.0 is protected with PairIP. Its manifest declares `com.pairip.application.Application`
 * as the app class, and that class's `attachBaseContext` runs two checks before Tandem's own
 * initialisation:
 *
 * 1. `SignatureCheck.verifyIntegrity(context)` hashes the installed APK's signing certificate and
 *    throws `SignatureTamperedException("Apk signature is invalid.")` when it does not match one of
 *    the expected values. Any re-signed APK fails this, so the process dies before the first
 *    activity — including with no patches applied beyond the re-sign itself.
 * 2. `LicenseClient.checkLicense(context)` binds Play's licensing service, which a sideloaded build
 *    cannot satisfy.
 *
 * Both methods are pure checks: they return nothing, keep no state that other code depends on, and
 * are not used by anything else in the APK. Replacing their bodies with `return-void` removes the
 * two gates without touching Tandem's startup, its network layer or its account handling.
 *
 * PairIP's method-level protection (`VMRunner`, `StartupLauncher`) is deliberately left intact, so
 * the classes it decrypts at runtime are still loaded normally.
 */
@Suppress("unused")
val bypassPairIpPatch = bytecodePatch(
    name = "Bypass PairIP checks",
    description = "Skips PairIP's APK signature and Play licence checks, which otherwise stop a " +
        "re-signed build from starting. Required for any patched Tandem build to run.",
    default = true,
) {
    compatibleWith(COMPATIBILITY_TANDEM_APK, COMPATIBILITY_TANDEM_APKM)

    execute {
        listOf(PairIpVerifyIntegrityFingerprint, PairIpLicenseCheckFingerprint).forEach { fingerprint ->
            fingerprint.method.apply {
                implementation!!.instructions.clear()
                addInstructions(0, "return-void")
            }
        }
    }
}

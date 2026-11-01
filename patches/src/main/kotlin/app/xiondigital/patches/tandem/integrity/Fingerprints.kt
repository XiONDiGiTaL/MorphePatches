package app.xiondigital.patches.tandem.integrity

import app.morphe.patcher.Fingerprint
import com.android.tools.smali.dexlib2.AccessFlags

/**
 * `com.pairip.SignatureCheck.verifyIntegrity(Context)` in Tandem 6.38.0.
 *
 * PairIP's own classes are not obfuscated, so this needs no string filter: Tandem's manifest
 * declares `com.pairip.application.Application`, whose `attachBaseContext` calls this method
 * before `super.attachBaseContext`. The body hashes the installed APK's signing certificate and
 * throws `SignatureTamperedException("Apk signature is invalid.")` on a mismatch, which is exactly
 * what happens after this patch framework re-signs the APK.
 */
internal object PairIpVerifyIntegrityFingerprint : Fingerprint(
    definingClass = "Lcom/pairip/SignatureCheck;",
    name = "verifyIntegrity",
    accessFlags = listOf(AccessFlags.PUBLIC, AccessFlags.STATIC),
    returnType = "V",
    parameters = listOf("Landroid/content/Context;"),
)

/**
 * `com.pairip.licensecheck.LicenseClient.checkLicense(Context)` in Tandem 6.38.0.
 *
 * Called from the same `attachBaseContext`, right after the signature check. It binds Google
 * Play's licensing service, which a sideloaded build cannot satisfy. `isIsolatedProcess()` shows
 * the method is designed to be skippable — it already returns early without doing anything when
 * there is no usable context.
 */
internal object PairIpLicenseCheckFingerprint : Fingerprint(
    definingClass = "Lcom/pairip/licensecheck/LicenseClient;",
    name = "checkLicense",
    accessFlags = listOf(AccessFlags.PUBLIC, AccessFlags.STATIC),
    returnType = "V",
    parameters = listOf("Landroid/content/Context;"),
)

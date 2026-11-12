# Android / Google Play preparation

This is a **provisional Trusted Web Activity (TWA)** shell for
`https://ai-syed-jalal-live.pages.dev/`. It uses Google's Android Browser
Helper to show the existing website in a compatible installed browser. It is not
an independent native AI app. The app requires a working website, browser,
backend and database; web features can vary by Android/browser version.

## Status — not a Play release

- `dev.pages.ai_syed_jalal_live.twa` is a **provisional application ID**. The
  owner must choose/confirm an available permanent ID before first publication.
- Java 17, Android SDK platform 36 and Gradle 8.14.3 are required. The wrapper
  verifies Gradle's published distribution checksum.
- `assembleDebug` builds an APK signed with the machine's **debug** key;
  `bundleRelease` builds an **unsigned** App Bundle. Neither is a Play release.
- No signing keystore, passwords, user data or provider secrets are committed.
- Until website-to-app Digital Asset Links are configured with the certificate
  used for installation, a browser address bar may appear; do not claim a TWA is
  verified. The app falls back according to the user's installed browser.
- There is no push-notification delegation, background sync, or filesystem API in
  this shell. Browser microphone permission is requested only by the website.

## Retained test APK

A copy of the existing debug build is available as a public, explicitly
[test-only GitHub prerelease](https://github.com/sjalalhs7/AI-Syed-Jalal-Final-Master/releases/tag/android-test-apk-retained-v1),
with the APK and its SHA-256 checksum. It is the same APK from
[Android test build 42370869040](https://github.com/sjalalhs7/AI-Syed-Jalal-Final-Master/actions/runs/42370869040),
not a new signed release. Its release asset has no seven-day Actions artifact
expiry, although its availability depends on the repository and GitHub. Its
package, target SDK, signature, and sensitive-permission checks were repeated;
installation on a physical device was not verified. It still opens the live
website and depends on its backend and database.

## Build and inspect

```sh
cd android
./gradlew :app:assembleDebug :app:bundleRelease
```

The debug APK is in `app/build/outputs/apk/debug/`. The unsigned AAB is in
`app/build/outputs/bundle/release/`. CI builds these as **test artifacts**;
release signing and Play upload are owner-controlled. Never upload a debug or
unsigned build to Play. Android Studio's **Generate Signed Bundle** can create
an AAB using your private upload key. Keep the key and passwords outside Git.

## Digital Asset Links (after confirming ID and keys)

Create `https://ai-syed-jalal-live.pages.dev/.well-known/assetlinks.json` at
that exact origin root, served over HTTPS as `application/json`, without a
redirect or authentication. It must contain the confirmed application ID and
colon-separated SHA-256 **certificate fingerprints**:

- For a locally installed test build, the certificate that signed that build.
- For a Play-delivered app using Play App Signing, the **app signing** certificate
  from Play Console (not just the upload certificate).

Do not publish placeholder fingerprints. The Android app's `asset_statements`
already points back to the website. Verify the association and behavior on real
Android devices; a successful build is not proof of that relationship.

## Before submission

Complete the data inventory and accurate public privacy policy with an operator
contact, deletion request/fulfilment, AI response reporting and safeguards;
repair and test the live database; complete Play's forms, reviewer access and
listing; and satisfy any account-specific closed testing requirement. See
[`docs/GOOGLE-RELEASE-READINESS.md`](../docs/GOOGLE-RELEASE-READINESS.md).
Approval is Google's decision. Do not enter credentials in chat or in this repo.

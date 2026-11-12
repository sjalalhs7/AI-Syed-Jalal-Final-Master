# Android / Google Play preparation

This is a **provisional Trusted Web Activity (TWA)** shell for
`https://ai-syed-jalal-live.pages.dev/`. It uses Google's Android Browser
Helper to show the existing website in a compatible installed browser. It is not
an independent native AI app. The app requires a working website, browser,
backend and database; web features can vary by Android/browser version.

## Status — not a Play release

- `dev.pages.ai_syed_jalal_live.mobile` is the new **provisional application
  ID**. It is distinct from the old debug APK's `.twa` ID so the candidate can
  be installed alongside it without removing the old app or its local data.
  The owner must confirm the permanent ID before Play publication.
- Java 17, Android SDK platform 36 and Gradle 8.14.3 are required. The wrapper
  verifies Gradle's published distribution checksum.
- `assembleDebug` builds an APK signed with the machine's **debug** key;
  `bundleRelease` builds an **unsigned** App Bundle. Neither is a Play release.
- No signing keystore, passwords, user data or provider secrets are committed.
- Until website-to-app Digital Asset Links are configured with the certificate
  used for installation, a browser address bar may appear; do not claim a TWA is
  verified. When a TWA is unavailable, the launcher uses an installed Custom
  Tabs browser. If Android's default URL handler is a chooser, the launcher's
  fallback checks the Browser Helper's suggested provider for Custom Tabs
  support instead of overlooking it. If no compatible provider is available or
  it cannot be opened, it shows a browser-needed message rather than launching
  an arbitrary URL handler.
- There is no push-notification delegation, background sync, or filesystem API in
  this shell. Browser microphone permission is requested only by the website.

## Signed test candidate

The public [Android 1.0.2 signed test candidate](https://github.com/sjalalhs7/AI-Syed-Jalal-Final-Master/releases/tag/android-mobile-1.0.2-candidate-v1)
contains the APK and its SHA-256 checksum. Unlike a seven-day Actions artifact,
a GitHub release asset has no automatic seven-day expiry, but its availability
still depends on GitHub and the repository. APK SHA-256:
`bece1bcc562a1a58842f8af8573dde098244055d601bf9743d3d2e093026ee1d`.
The unsigned source build was produced from `96c2f14d0def1a1dccc750c6cd8d315a7937fbb8`;
the APK was signed locally using the certificate in the association file.
**Do not use the earlier 1.0.1 candidate:** it did not restrict an explicit
launch intent to the intended website. Do not use the old debug APK either.

The exact signed APK installed alongside the old debug package, opened and
reopened the homepage, rejected an unrelated explicit HTTPS launch URL, and
showed a browser-needed message with Chrome disabled on Android 8 and 15
[emulators](https://github.com/sjalalhs7/AI-Syed-Jalal-Final-Master/actions/runs/43281505969)
and in a separate Android 11
[emulator run](https://github.com/sjalalhs7/AI-Syed-Jalal-Final-Master/actions/runs/43283063776).
The Android 11 job in the first run did not complete and is not counted as a
pass. A [separate check](https://github.com/sjalalhs7/AI-Syed-Jalal-Final-Master/actions/runs/43283849828)
verified the public download matches those signed bytes. The URL test is not
an exhaustive security assessment. These tests used `adb`: neither a physical
phone's installer and Play Protect warning nor Google Play approval has been
tested. Do not disable protections or assume the warning will disappear. The
APK depends on the live website and its backend, which still has an incomplete
database schema.

Keep the locally generated private signing key and its password protected and
backed up outside Git and public releases. Losing them can prevent signed updates.
The provisional package ID and release are not a completed Play submission.

## Retained old debug APK — do not use

A copy of the existing debug build is available as a public, explicitly
[test-only GitHub prerelease](https://github.com/sjalalhs7/AI-Syed-Jalal-Final-Master/releases/tag/android-test-apk-retained-v1),
with the APK and its SHA-256 checksum. It is the same APK from
[Android test build 42370869040](https://github.com/sjalalhs7/AI-Syed-Jalal-Final-Master/actions/runs/42370869040),
not a new signed release. Its release asset has no seven-day Actions artifact
expiry, although its availability depends on the repository and GitHub. The
owner reported that it did not open and showed an installation warning. On a
[disposable Android 15 emulator](https://github.com/sjalalhs7/AI-Syed-Jalal-Final-Master/actions/runs/43253513036),
the exact retained APK crashed during launch: Android Browser Helper 2.7.2 tried
to enable an undeclared `ManageDataLauncherActivity`. The manifest in this
source declares the missing component. This reproduces a launch failure, but
it does not establish the cause of every device's issue or the installation
warning. **Do not treat the old APK as a working release.**

The `Android launch regression` workflow builds the changed code, installs both
old and new package IDs side by side, checks that the homepage renders and
reopens on several emulator API levels, tests an unrelated explicit HTTPS URL,
and checks the missing-browser message. The workflow must pass before an APK
built from this source is distributed; it cannot verify physical devices or
Play Protect's installer warning. The app still relies on the live website, a
compatible browser, and the website's backend and database. It is not an
independent native AI app.

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

## Digital Asset Links

The source includes `frontend/.well-known/assetlinks.json` for the candidate
`.mobile` package and its public release-certificate fingerprint. It must be
served at `https://ai-syed-jalal-live.pages.dev/.well-known/assetlinks.json`
over HTTPS as `application/json`, without a redirect or authentication. Its
presence in source does **not** prove it is live or that Android has verified
it. Debug builds use a different key and will not match that fingerprint.

If the owner later publishes through Play App Signing, the association must
also include the **app signing** certificate from Play Console (not just the
upload certificate). Do not use placeholder fingerprints. Verify the published
file and behavior on real Android devices. Keep the private signing key and its
password separate, protected, and outside Git; the public fingerprint is not
a private key.

## Before submission

Complete the data inventory and accurate public privacy policy with an operator
contact, deletion request/fulfilment, AI response reporting and safeguards;
repair and test the live database; complete Play's forms, reviewer access and
listing; and satisfy any account-specific closed testing requirement. See
[`docs/GOOGLE-RELEASE-READINESS.md`](../docs/GOOGLE-RELEASE-READINESS.md).
Approval is Google's decision. Do not enter credentials in chat or in this repo.

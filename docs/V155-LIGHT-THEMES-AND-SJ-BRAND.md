# Light themes, crowned SJ identity and JARVIS welcome

## One application and one data model

This update is a presentation-layer change. It does **not** create a second database, copy accounts, migrate records, delete data or alter API endpoints. The Android Trusted Web Activity continues to open `https://ai-syed-jalal-live.pages.dev/`, the same origin used by the website. The previous production readiness finding (13 of 24 required table names present when last checked) is a separate issue; this visual update does not repair or verify that database.

Six light styles—glass, water, clay, ice, fire and rainbow—share one local selection (`aj-site-theme-v2`). The first visit can read a valid earlier theme preference without deleting or changing the old keys. The preference lives in browser/app storage, so a different browser, private session, device or isolated app installation may have its own choice. Account and record storage remains as before. Service-worker cleanup removes only older `aj-v` shell caches, not unrelated origin caches. Reduced-motion settings disable the added decorative animation. Colours, contrast, layouts and browser interactions were checked with automated tests, but still need review on real devices.

## Branding and install surfaces

All current pages use the retained `assets/approved-sj-rainbow-crown.svg`; legacy SJS files are kept on disk only for old references. The SVG favicon, PWA icons, maskable icon, social card, install screenshots and Android launcher are refreshed. The Android launcher is byte-identical to the website's 512-pixel icon. `scripts/render-sj-brand.mjs` regenerates the raster assets from the crowned SJ SVG; maskable artwork occupies 72% of the canvas and a browser pixel test checks that it remains inside the 80% safe circle.

The Android package remains a **provisional TWA** (`dev.pages.ai_syed_jalal_live.twa`). The GitHub Actions workflow produces a debug APK and an unsigned AAB for testing, not a Play-ready signed release. Digital Asset Links, the final signing identity, physical-device testing and Play approval still require the owner. This update does not add native notification, background-sync, filesystem or microphone permissions.

## Welcome speech

The homepage requests browser speech for the supplied Roman Urdu greeting followed by the short Durood “Allahumma salli ala Muhammadin wa ala aali Muhammad.” It honors the existing shared voice preference, displays the text, offers Listen and Stop controls, and does not activate the microphone. No application API receives the greeting; the browser/OS speech provider may process text under its own terms. Browser autoplay rules, unavailable voices or device settings may block audio; a tap-to-listen message is shown instead of claiming success. Voice quality and pronunciation vary and should be checked on a real phone and browser.

## Validation

Local verification covers JavaScript/static checks, frontend and server tests, and browser flows including existing CRUD/sign-in, the six preferences, reduced motion, offline shell, greeting speech test doubles and blocked-autoplay fallback. Automated fake speech does not prove audible playback or pronunciation on a physical device. Android build/permission checks run in GitHub Actions; signing, Digital Asset Links, production schema repair, Search indexing and Play review are separate gates.

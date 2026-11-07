# JARVIS opening greeting

## Behavior

On a fresh website or installed-app entry, direct page entry, reload or return from the background, JARVIS attempts to play the selected Urdu voice recording of the owner's greeting and a short Durood. The Roman Urdu wording and Durood remain available as text. The greeting is not repeated on normal navigation between pages after it has started. An unplayed greeting remains available on the next page. Only the app's `aj-welcome-visit-v1` session-storage key tracks this transient state; no account, record or database is created, moved, read or changed.

The recording is `frontend/assets/jarvis-welcome-ur-pk.mp3`, generated in Urdu using the owner's selected voice and served from the same origin. V157 fixes an issue where a saved or default browser voice could replace that recording at opening. The opening and Listen button now use the same selected recording, regardless of browser speech preferences; those preferences remain unchanged for other assistant replies. If the recording cannot be played, the UI offers a retry and the text instead of silently substituting a different voice. The recording and versioned welcome assets are precached for the installed shell; the local preview serves MP3 as `audio/mpeg`. The greeting never turns on a microphone or sends text to an application API.

Browsers may block audio on page opening, even for an installed app. This cannot be overridden by the site. A visible, dismissible JARVIS welcome offers **Listen**, **Stop**, and a transcript; tapping Listen retries within a user gesture. Failed or silent playback is reported instead of claiming success. Returning to the page can trigger a fresh welcome, and active welcome audio is stopped before the user starts another assistant microphone or read-aloud action. Device volume, mute, browser audio restrictions and audio codecs can still affect sound.

## Verification and limits

Automated tests cover initial and direct entry, reload, a new tab, normal internal navigation, return from a hidden tab, blocked and stalled autoplay, saved or default browser voice isolation, recording errors, transcript, stopping, microphone coordination, offline cache and preservation of unrelated caches. Chromium decodes the actual recording and exercises tap-to-play offline, but automated, muted/headless tests do **not** prove audible output, pronunciation or behavior on a physical Android/iOS device. Test on the owner's real phone and browser.

The Android TWA points to the same website and existing backend; this change does not require a new APK to update the web-delivered greeting. It does not repair production schema readiness or change production data.

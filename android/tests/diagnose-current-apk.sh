#!/usr/bin/env bash
# Diagnose the exact APK previously delivered, without logging in or mutating the
# production database. This emulator cannot establish physical-device behavior
# or Play Protect's sideload warning (adb installation bypasses that UI).
set -euo pipefail

: "${APK_PATH:?}"
: "${DIAGNOSTICS_DIR:?}"
: "${API_LABEL:?}"
mkdir -p "$DIAGNOSTICS_DIR"
PACKAGE=dev.pages.ai_syed_jalal_live.twa
ACTIVITY=com.google.androidbrowserhelper.trusted.LauncherActivity

notice() {
  local title=$1 message=$2
  message=${message//'%'/'%25'}
  message=${message//$'\r'/'%0D'}
  message=${message//$'\n'/'%0A'}
  echo "::notice file=android/README.md,line=1,title=${title}::${message}"
}

dump_ui() {
  local prefix=$1
  adb shell uiautomator dump /sdcard/window.xml > /dev/null 2>&1 || return 1
  adb exec-out cat /sdcard/window.xml > "$DIAGNOSTICS_DIR/$prefix.xml"
}

ui_summary() {
  python3 - "$DIAGNOSTICS_DIR/$1.xml" <<'PY'
import sys, xml.etree.ElementTree as ET
try:
    root = ET.parse(sys.argv[1]).getroot()
    text, packages = [], set()
    for node in root.iter('node'):
        if node.get('package'): packages.add(node.get('package'))
        for key in ('text', 'content-desc'):
            value = (node.get(key) or '').strip().replace('\n', ' ')
            if value and value not in text: text.append(value)
    print('packages=' + ','.join(sorted(packages)) + '; UI=' + ' | '.join(text[:20])[:1200])
except Exception as exc:
    print('UI dump unavailable: ' + type(exc).__name__)
PY
}

# Dismiss first-run prompts only in this disposable test emulator. We never
# disable Play Protect, and do not attempt to sign into an account.
click_first_run_button() {
  local point
  point=$(python3 - "$DIAGNOSTICS_DIR/launch.xml" <<'PY'
import re, sys, xml.etree.ElementTree as ET
allowed = {'Use without an account', 'Accept & continue', 'Accept and continue',
           'Continue without an account', 'No thanks', 'No, thanks', 'Got it'}
try:
    root = ET.parse(sys.argv[1]).getroot()
    for node in root.iter('node'):
        if node.get('text','').strip() not in allowed: continue
        m = re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', node.get('bounds',''))
        if m:
            x1,y1,x2,y2=map(int,m.groups())
            print((x1+x2)//2, (y1+y2)//2)
            break
except Exception:
    pass
PY
)
  if [[ -n "$point" ]]; then
    # shellcheck disable=SC2086 # point is two integers generated above
    adb shell input tap $point
  fi
}

adb shell input keyevent 82 || true
adb logcat -c
adb install -r "$APK_PATH" > "$DIAGNOSTICS_DIR/install.txt"
adb shell am start -W -a android.intent.action.MAIN -c android.intent.category.LAUNCHER \
  -n "$PACKAGE/$ACTIVITY" > "$DIAGNOSTICS_DIR/start.txt" 2>&1 || true

# Allow for the browser's first run and network rendering. An accessible web
# text match is stricter than merely seeing the launcher Activity start.
opened=0
for attempt in $(seq 1 18); do
  sleep 5
  dump_ui launch || continue
  if grep -Eqi 'Professional AI Workspace|One connected workspace|Your AI Partner for a Smarter Tomorrow' "$DIAGNOSTICS_DIR/launch.xml"; then
    opened=1
    break
  fi
  click_first_run_button
done
adb shell dumpsys activity activities > "$DIAGNOSTICS_DIR/activities.txt" || true
adb logcat -d -s AndroidRuntime:E TWALauncherActivity:D TwaLauncher:D > "$DIAGNOSTICS_DIR/logcat.txt" || true
adb exec-out screencap -p > "$DIAGNOSTICS_DIR/launch.png" || true
summary=$(ui_summary launch)
notice "Previous APK on API ${API_LABEL}" "website_text_visible=${opened}; ${summary}"
start=$(tr '\n' ' ' < "$DIAGNOSTICS_DIR/start.txt" | cut -c1-700)
notice "Previous APK activity start API ${API_LABEL}" "$start"
if grep -q 'FATAL EXCEPTION' "$DIAGNOSTICS_DIR/logcat.txt"; then
  notice "Previous APK crash API ${API_LABEL}" "AndroidRuntime reported a fatal exception; full log is in the diagnostic artifact."
fi

# Investigate whether a clear fallback is shown when Chrome is unavailable.
# This change affects only the throwaway emulator, never the user's phone.
adb shell am force-stop "$PACKAGE" || true
if adb shell pm list packages | grep -q 'package:com.android.chrome'; then
  adb shell pm disable-user --user 0 com.android.chrome > /dev/null || true
fi
adb shell am start -W -a android.intent.action.MAIN -c android.intent.category.LAUNCHER \
  -n "$PACKAGE/$ACTIVITY" > "$DIAGNOSTICS_DIR/no-chrome-start.txt" 2>&1 || true
sleep 10
if dump_ui no-chrome; then
  notice "Previous APK without Chrome API ${API_LABEL}" "$(ui_summary no-chrome)"
  adb exec-out screencap -p > "$DIAGNOSTICS_DIR/no-chrome.png" || true
else
  notice "Previous APK without Chrome API ${API_LABEL}" "No accessible window dump was obtained."
fi

if [[ "$opened" != 1 ]]; then
  echo '::error file=android/README.md,line=1::The previous APK did not display the expected website text in this emulator.'
  exit 1
fi

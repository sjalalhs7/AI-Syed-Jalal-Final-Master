#!/usr/bin/env bash
# Executed on disposable emulators. This does not test Play Protect warnings,
# physical devices, sign-in, providers or any production database repair.
set -euo pipefail
: "${APK_PATH:?}"
: "${OLD_APK_PATH:?}"
: "${DIAGNOSTICS_DIR:?}"
: "${API_LABEL:?}"
mkdir -p "$DIAGNOSTICS_DIR"
PACKAGE=dev.pages.ai_syed_jalal_live.mobile
OLD_PACKAGE=dev.pages.ai_syed_jalal_live.twa
ACTIVITY=dev.pages.ai_syed_jalal_live.twa.SafeLauncherActivity

notice() {
  local title=$1 message=$2
  message=${message//'%'/'%25'}
  message=${message//$'\r'/'%0D'}
  message=${message//$'\n'/'%0A'}
  echo "::notice file=android/README.md,line=1,title=${title}::${message}"
}

dump_ui() {
  local prefix=$1
  adb shell uiautomator dump /sdcard/arena-window.xml > /dev/null 2>&1 || return 1
  adb exec-out cat /sdcard/arena-window.xml > "$DIAGNOSTICS_DIR/$prefix.xml"
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

click_browser_first_run() {
  local point
  point=$(python3 - "$DIAGNOSTICS_DIR/$1.xml" <<'PY'
import re, sys, xml.etree.ElementTree as ET
allowed = {value.casefold() for value in ('Use without an account', 'Accept & continue',
           'Accept and continue', 'Continue without an account', 'No thanks',
           'No, thanks', 'Got it', 'Next', 'Skip')}
try:
    root = ET.parse(sys.argv[1]).getroot()
    for node in root.iter('node'):
        if node.get('text','').strip().casefold() not in allowed: continue
        match = re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', node.get('bounds',''))
        if match:
            x1,y1,x2,y2 = map(int, match.groups())
            print((x1+x2)//2, (y1+y2)//2)
            break
except Exception:
    pass
PY
)
  if [[ -n "$point" ]]; then
    # The only possible values are two integers generated above.
    # shellcheck disable=SC2086
    adb shell input tap $point
  fi
}

check_no_app_crash() {
  local phase=$1
  if ! adb logcat -d -s AndroidRuntime:E > "$DIAGNOSTICS_DIR/$phase-logcat.txt"; then
    echo "::error file=android/README.md,line=1::Could not read Android crash logs for API ${API_LABEL}."
    return 1
  fi
  if ! python3 - "$DIAGNOSTICS_DIR/$phase-logcat.txt" "$PACKAGE" <<'PY'
import sys
text = open(sys.argv[1], encoding='utf8', errors='replace').read()
for segment in text.split('FATAL EXCEPTION:')[1:]:
    if ('Process: ' + sys.argv[2] + ',') in segment[:1200]:
        print('The candidate app crashed: ' + segment[:1500])
        sys.exit(1)
PY
  then
    notice "Android API ${API_LABEL} crash" "A fatal exception in the candidate app is in the diagnostic artifact."
    return 1
  fi
}

wait_for_site() {
  local phase=$1
  for attempt in $(seq 1 24); do
    sleep 5
    dump_ui "$phase" || continue
    if grep -Eqi 'Professional AI Workspace|One connected workspace|Your AI Partner for a Smarter Tomorrow' "$DIAGNOSTICS_DIR/$phase.xml"; then
      notice "Android API ${API_LABEL} ${phase}" "Website text is visible. $(ui_summary "$phase")"
      return 0
    fi
    click_browser_first_run "$phase"
  done
  if [[ -f "$DIAGNOSTICS_DIR/$phase.xml" ]]; then
    notice "Android API ${API_LABEL} ${phase}" "Website text was not visible. $(ui_summary "$phase")"
  fi
  echo "::error file=android/README.md,line=1::The expected homepage did not render during ${phase} on API ${API_LABEL}."
  return 1
}

adb shell input keyevent 82 || true
adb install -r "$OLD_APK_PATH" > "$DIAGNOSTICS_DIR/install-old.txt"
adb install -r "$APK_PATH" > "$DIAGNOSTICS_DIR/install-new.txt"
adb shell pm list packages > "$DIAGNOSTICS_DIR/packages.txt"
grep -Fx "package:$OLD_PACKAGE" "$DIAGNOSTICS_DIR/packages.txt"
grep -Fx "package:$PACKAGE" "$DIAGNOSTICS_DIR/packages.txt"
notice "Android API ${API_LABEL} installation" 'The old and new app packages installed side by side in the emulator.'

# Play Store images on older Android may forbid clearing logs; reading and
# checking the candidate package's crash entries is still mandatory.
adb logcat -c || true
adb shell am start -W -a android.intent.action.MAIN -c android.intent.category.LAUNCHER \
  -n "$PACKAGE/$ACTIVITY" > "$DIAGNOSTICS_DIR/launch-start.txt" 2>&1
wait_for_site launch
check_no_app_crash launch
adb exec-out screencap -p > "$DIAGNOSTICS_DIR/launch.png" || true

# Return to the launcher and open the app again, as a user would.
adb shell input keyevent HOME
adb shell am force-stop "$PACKAGE"
adb logcat -c || true
adb shell am start -W -a android.intent.action.MAIN -c android.intent.category.LAUNCHER \
  -n "$PACKAGE/$ACTIVITY" > "$DIAGNOSTICS_DIR/relaunch-start.txt" 2>&1
wait_for_site relaunch
check_no_app_crash relaunch

# An explicit intent can bypass the manifest's implicit host filter. A request
# for another HTTPS origin must fall back to our homepage rather than open it
# in this app's browser task. The emulator uses only this synthetic URL.
adb shell input keyevent HOME
adb shell am force-stop "$PACKAGE"
adb shell am force-stop com.android.chrome || true
adb logcat -c || true
adb shell am start -W -a android.intent.action.VIEW -d 'https://example.com/' \
  -n "$PACKAGE/$ACTIVITY" > "$DIAGNOSTICS_DIR/external-intent-start.txt" 2>&1
wait_for_site external-intent
check_no_app_crash external-intent
adb logcat -d -s SafeLauncherActivity:W > "$DIAGNOSTICS_DIR/external-intent-filter.txt"
grep -F 'Ignoring an external or unsupported launch URL' "$DIAGNOSTICS_DIR/external-intent-filter.txt"
notice "Android API ${API_LABEL} external intent" 'An unrelated HTTPS origin was rejected and the intended homepage appeared.'

# With Chrome disabled on the emulator, either another browser displays the
# site or a clear browser-needed dialog must appear; a silent crash is failure.
adb shell input keyevent HOME
adb shell am force-stop "$PACKAGE"
if adb shell pm list packages | grep -Fxq 'package:com.android.chrome'; then
  # A previously opened browser task can remain visible in the emulator; stop
  # it before disabling Chrome so a stale page cannot count as a fallback.
  adb shell am force-stop com.android.chrome || true
  adb shell pm disable-user --user 0 com.android.chrome > "$DIAGNOSTICS_DIR/disable-chrome.txt"
  adb shell pm list packages -d | grep -Fx 'package:com.android.chrome'
  adb shell input keyevent HOME
  adb logcat -c || true
  adb shell am start -W -a android.intent.action.MAIN -c android.intent.category.LAUNCHER \
    -n "$PACKAGE/$ACTIVITY" > "$DIAGNOSTICS_DIR/no-chrome-start.txt" 2>&1
  sleep 12
  dump_ui no-chrome
  notice "Android API ${API_LABEL} without Chrome" "$(ui_summary no-chrome)"
  adb exec-out screencap -p > "$DIAGNOSTICS_DIR/no-chrome.png" || true
  check_no_app_crash no-chrome
  if grep -Fq 'package="com.android.chrome"' "$DIAGNOSTICS_DIR/no-chrome.xml"; then
    echo "::error file=android/README.md,line=1::The disabled-Chrome test still showed Chrome; it cannot prove fallback behavior on API ${API_LABEL}."
    exit 1
  fi
  if ! grep -Eqi 'Browser needed|needs a compatible browser|Professional AI Workspace|One connected workspace|Your AI Partner for a Smarter Tomorrow' "$DIAGNOSTICS_DIR/no-chrome.xml"; then
    echo "::error file=android/README.md,line=1::No homepage or browser-needed explanation was visible without Chrome on API ${API_LABEL}."
    exit 1
  fi
else
  notice "Android API ${API_LABEL} without Chrome" 'Chrome was not installed; the disabled-Chrome case could not be separately exercised.'
fi

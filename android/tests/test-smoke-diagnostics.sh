#!/usr/bin/env bash
# Exercise the emulator smoke helpers without an emulator, network or real data.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
export APK_PATH=unused OLD_APK_PATH=unused DIAGNOSTICS_DIR="$tmp/evidence" API_LABEL=30
# shellcheck source=smoke-launch.sh
source "$here/smoke-launch.sh"

scenario=success
attempts=0
sleep() { :; }
adb() {
  case "${1:-} ${2:-} ${3:-}" in
    'shell input tap') printf '%s %s\n' "$4" "$5" >> "$DIAGNOSTICS_DIR/taps.txt" ;;
    'logcat -d -s')
      if [[ "$scenario" == crash ]]; then
        printf 'FATAL EXCEPTION: main\nProcess: %s, PID: 42\n' "$PACKAGE"
      fi ;;
    *) echo 'Unexpected fake adb command' >&2; return 1 ;;
  esac
}
dump_ui() {
  attempts=$((attempts + 1))
  if [[ "$scenario" == unavailable ]]; then return 1; fi
  if [[ "$scenario" == success && "$attempts" -gt 1 ]]; then
    printf '%s\n' '<hierarchy><node package="com.android.chrome" text="Professional AI Workspace" /></hierarchy>' > "$DIAGNOSTICS_DIR/$1.xml"
  else
    printf '%s\n' '<hierarchy><node package="com.android.chrome" text="No thanks" bounds="[42,1626][280,1752]" /></hierarchy>' > "$DIAGNOSTICS_DIR/$1.xml"
  fi
}

# A recognized first-run prompt is tapped; only a subsequently rendered site
# passes. The history remains available without changing the success criteria.
wait_for_site launch > "$tmp/success.out"
grep -Fq 'Website text is visible' "$tmp/success.out"
grep -Fq 'attempt=1 first-run tap=161 1689' "$DIAGNOSTICS_DIR/launch-progress.txt"
grep -Fq 'attempt=2 packages=com.android.chrome' "$DIAGNOSTICS_DIR/launch-progress.txt"
test "$(wc -l < "$DIAGNOSTICS_DIR/taps.txt")" -eq 1
check_no_app_crash launch

# A stuck browser is still a failure; the final attempts and candidate crash
# evidence are surfaced rather than being mistaken for a passing launch.
scenario=crash
attempts=0
: > "$DIAGNOSTICS_DIR/taps.txt"
if wait_for_site stuck > "$tmp/crash.out" 2>&1; then
  echo 'A stuck browser unexpectedly passed' >&2
  exit 1
fi
test "$attempts" -eq 24
test "$(wc -l < "$DIAGNOSTICS_DIR/taps.txt")" -eq 24
grep -Fq 'Android API 30 stuck recent attempts' "$tmp/crash.out"
grep -Fq 'Android API 30 crash' "$tmp/crash.out"
grep -Fq 'The expected homepage did not render' "$tmp/crash.out"
grep -Fq "Process: $PACKAGE," "$DIAGNOSTICS_DIR/stuck-logcat.txt"

# If UI dumps themselves fail, report that separately and still fail closed.
scenario=unavailable
attempts=0
if wait_for_site missing > "$tmp/missing.out" 2>&1; then
  echo 'Unavailable UI dumps unexpectedly passed' >&2
  exit 1
fi
test "$attempts" -eq 24
grep -Fq 'attempt=24 UI dump unavailable' "$DIAGNOSTICS_DIR/missing-progress.txt"
grep -Fq 'The expected homepage did not render' "$tmp/missing.out"
echo 'Android smoke diagnostics: 3 synthetic cases passed.'

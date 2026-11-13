#!/usr/bin/env bash
# Temporary diagnostic around the unmodified emulator smoke test.
set -u
: "${DIAGNOSTICS_DIR:?}"
result=0
bash "${SMOKE_SCRIPT:-android/tests/smoke-launch.sh}" || result=$?
if [ "$result" -ne 0 ] && mkdir -p "$DIAGNOSTICS_DIR"; then
  # Probe only; do not restart ADB, retry the test, or hide the original error.
  {
    echo '--- adb devices ---'
    timeout 12 adb devices -l || true
    echo '--- adb state ---'
    timeout 12 adb get-state || true
    echo '--- emulator boot state ---'
    timeout 12 adb shell getprop sys.boot_completed || true
  } > "$DIAGNOSTICS_DIR/failure-adb-probe.txt" 2>&1 || true
  timeout 15 adb logcat -d -s AndroidRuntime:E > "$DIAGNOSTICS_DIR/failure-probe-logcat.txt" 2>&1 || true
fi
exit "$result"

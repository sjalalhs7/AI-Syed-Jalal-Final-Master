#!/usr/bin/env bash
# Test the temporary probe without an emulator or network.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/bin"
printf '#!/bin/sh\nprintf "fake adb: %%s\\n" "$*"\n' > "$tmp/bin/adb"
printf '#!/bin/sh\nexit 0\n' > "$tmp/pass.sh"
printf '#!/bin/sh\nexit 23\n' > "$tmp/fail.sh"
chmod +x "$tmp/bin/adb"
PATH="$tmp/bin:$PATH" SMOKE_SCRIPT="$tmp/pass.sh" DIAGNOSTICS_DIR="$tmp/pass" bash "$here/android8-probe.sh"
test ! -e "$tmp/pass/failure-adb-probe.txt"
result=0
PATH="$tmp/bin:$PATH" SMOKE_SCRIPT="$tmp/fail.sh" DIAGNOSTICS_DIR="$tmp/fail" bash "$here/android8-probe.sh" || result=$?
test "$result" -eq 23
grep -Fq 'fake adb: devices -l' "$tmp/fail/failure-adb-probe.txt"
grep -Fq 'fake adb: get-state' "$tmp/fail/failure-adb-probe.txt"
grep -Fq 'fake adb: logcat -d -s AndroidRuntime:E' "$tmp/fail/failure-probe-logcat.txt"
echo 'Probe wrapper: success and original-failure preservation passed.'

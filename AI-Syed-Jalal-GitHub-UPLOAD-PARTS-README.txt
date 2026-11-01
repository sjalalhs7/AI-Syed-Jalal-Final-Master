AI-Syed-Jalal — historical recovery parts

The nine original parts are already present in this repository and on release v1.0.0.
Do not upload duplicate copies. The parts are binary chunks, not individual ZIPs.

Recommended verification (Python 3.11+, standard library only):
  python scripts/verify_recovery.py

Windows reconstruction:
1. Keep all nine part files and AI-Syed-Jalal-GitHub-MERGE-PARTS-WINDOWS.bat together.
2. Double-click the batch file (or run it with --no-pause from a terminal).
3. It creates AI-Syed-Jalal-FINAL-RECOVERED-MASTER.zip ONLY after SHA-256 matches.
4. Existing output is never replaced. Move it aside explicitly to rebuild.
5. Expected original ZIP SHA-256:
   21dc9b76289706ea12640cd6579e7efedb8215ca50d7c70f411b2fe09649369c
6. Expected original ZIP size: 172,636,153 bytes.

The batch file verifies the combined checksum but does not validate ZIP paths.
For CRC/inventory checks and safe extraction, use the Python verifier instead:
  python scripts/verify_recovery.py --output ../recovered.zip --extract ../recovered-source

IMPORTANT: the existing UPDATED-2026-10-11.sha256 file describes a DIFFERENT,
updated release ZIP (165,413,942 bytes), not the ZIP rebuilt from these parts.
Use AI-Syed-Jalal-Master.sha256 or recovery-manifest.json for these parts.

These are historical artifacts, not the latest application source or a sanitized
production release. Read SECURITY.md and docs/AUDIT-2026-11-01.md before use.

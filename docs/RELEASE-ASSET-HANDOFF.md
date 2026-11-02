# Release Asset Handoff

Checked against GitHub on **2026-11-01**. This supersedes the obsolete claim that no archive has been uploaded.

## Published release `v1.0.0`

Release: https://github.com/sjalalhs7/AI-Syed-Jalal-Final-Master/releases/tag/v1.0.0

GitHub reports a published release containing:

- The nine original `AI-Syed-Jalal-Master.part00`–`part08` assets.
- `AI-Syed-Jalal-MASTER-RECOVERY-UPDATED-2026-10-11-2.zip` — 165,413,942 bytes; GitHub asset digest `sha256:19333acbe525cbdbc1c048840679a3d47927a27eeafb2fe025f9dca94b21f712`.
- Updated-ZIP checksum files, a historical update report, and an additional part07 asset named `AI-Syed-Jalal-Master-1.part07`.

The updated ZIP's name, size and digest were verified through GitHub asset metadata. Its bytes could not be downloaded in this audit environment because the asset CDN was unreachable; this is **metadata verification, not a second local CRC/byte audit**. The original parts were fully reconstructed and verified locally.

## Original split archive

- Reconstructed name: `AI-Syed-Jalal-FINAL-RECOVERED-MASTER.zip`
- Size: **172,636,153 bytes**
- SHA-256: `21dc9b76289706ea12640cd6579e7efedb8215ca50d7c70f411b2fe09649369c`
- Entries: **12,156**, including directories
- File entries: **9,990**
- Uncompressed size: **299,780,270 bytes**
- Every part hash, complete ZIP hash, CRCs and inventory: **PASS**
- Case-variant duplicates: **75 files / 25 directories**, all byte-identical; safe extraction keeps the first canonical spelling and yields **9,915 distinct files**.

Use `recovery-manifest.json` and `python scripts/verify_recovery.py`. The updated release ZIP has a different fingerprint and must not be checked against the original-parts manifest.

## Draft releases

- `v120-recovery-master`: draft, no assets at inspection time. Its description still says the binary is pending even though `v1.0.0` now has assets. Review/close or update this draft rather than publishing contradictory instructions.
- `v125-recovery-rc.1`: draft with `AI-Syed-Jalal-Recovery-Candidate-Bundle.zip` (162,237,321 bytes). It is a different candidate, not the original or updated ZIP above. Its provenance points to an older recovery commit; do not present it as the current application tip.

No release was published, deleted, retagged or otherwise changed by this audit.

## Before another public release

1. Start from the intended reviewed application commit, not the historical ZIP parts.
2. Resolve the source release-gate failures and security actions in `docs/AUDIT-2026-11-01.md`.
3. Run offline checks plus authenticated database/browser/provider tests in a controlled environment.
4. Generate a new archive and a new checksum/manifest; do not reuse a historical fingerprint.
5. Verify the uploaded asset's name, size, digest and a fresh download.
6. Keep the approved Login/Homepage/Logo identity unchanged.
7. Publish release notes that distinguish implemented, configured and live-verified capabilities.

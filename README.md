# AI-Syed-Jalal — Recovery Control Repository

This branch stores the original split recovery archive, its verification controls, and audit documentation. **The ZIP parts are a historical snapshot, not the latest application source.** Application development continues on the recovery/source branches; see [the audit](docs/AUDIT-2026-11-01.md) for the exact revisions inspected and remaining release blockers.

## Locked design rule

The approved Login Page, Homepage, Logo, theme language, and hierarchy are locked. Add capabilities without unnecessary redesign. Historical concept boards are references, not replacements for the approved design.

## Verify before extracting

Requires Python 3.11 or newer; no third-party Python packages are needed.

```sh
# Check all nine part hashes, reconstructed ZIP hash, CRCs, and safe inventory.
# Does not retain a ZIP or execute any recovered code.
python scripts/verify_recovery.py

# Optionally retain the verified original ZIP and extract into NEW directories.
python scripts/verify_recovery.py \
  --output ../AI-Syed-Jalal-FINAL-RECOVERED-MASTER.zip \
  --extract ../recovered-source

# Offline regression tests for the recovery controls.
python -m unittest discover -s tests -v
```

On Windows, double-click `AI-Syed-Jalal-GitHub-MERGE-PARTS-WINDOWS.bat`. It now **fails closed on a checksum mismatch** and refuses to replace an existing output. The batch merger verifies integrity but does not inspect or extract ZIP entries; prefer the Python verifier for safe extraction.

Do not run recovered installers, dependency lifecycle scripts, or imported upstream applications merely to verify an archive. The original archive contains known historical security and portability issues described in the audit.

## Two different ZIP fingerprints

| Artifact | Size | SHA-256 |
|---|---:|---|
| Original ZIP reconstructed from `AI-Syed-Jalal-Master.part00`–`part08` | 172,636,153 bytes | `21dc9b76289706ea12640cd6579e7efedb8215ca50d7c70f411b2fe09649369c` |
| Updated ZIP published as `AI-Syed-Jalal-MASTER-RECOVERY-UPDATED-2026-10-11-2.zip` on release `v1.0.0` | 165,413,942 bytes | `19333acbe525cbdbc1c048840679a3d47927a27eeafb2fe025f9dca94b21f712` |

`AI-Syed-Jalal-Master.sha256` and `recovery-manifest.json` describe the **original** parts. The older `AI-Syed-Jalal-MASTER-RECOVERY-UPDATED-2026-10-11.sha256` describes the **updated release asset**, not these parts. Do not interchange the checksums.

## Source lineage

- V122-MERGED: 9,950 files; 282,418,696 uncompressed bytes in its original archive.
- V125-FULL: 1,226 files; 18,719,357 uncompressed bytes; a curated continuation, not a complete replacement for V122.
- The original recovery combines V122 lineage with selected V125 additions and engineering records.
- The original V25 archive remains missing/unverified.
- The original ZIP has 9,990 file entries. It includes 75 byte-identical case-variant files under upstream `Superpowers`/`superpowers`; portable extraction yields 9,915 unique files without losing distinct content.

## Verification boundary

The original archive's checksum, ZIP CRCs, inventory, and historical package regression gates pass. At the inspected later application revision, all 59 frontend tests and 80 first-party JavaScript syntax checks pass, but the aggregate `test:release` command fails on obsolete UI assertions. That failure is **not** hidden or counted as a pass.

No live PostgreSQL, provider/fallback, research grounding, medical safety, physical device/voice, production deployment, or exact V25 lineage verification is claimed. See the audit before publishing or deploying.

## Documents

- [Audit and remediation — 2026-11-01](docs/AUDIT-2026-11-01.md)
- [Finalization status](docs/FINALIZATION-STATUS.md)
- [Agent capability roadmap](docs/AGENT-CAPABILITY-ROADMAP.md)
- [Release asset handoff](docs/RELEASE-ASSET-HANDOFF.md)
- [Historical update report](AI-Syed-Jalal-RECOVERY-UPDATE-2026-10-11.md)
- [Security handling](SECURITY.md)

Provider secrets stay server-side. Never commit API keys or production credentials. Medical features must be educational, source-grounded, and safety-gated. Microphone/camera/screen access must be opt-in, permission-gated, visibly active, and revocable.

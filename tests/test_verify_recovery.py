"""Small, offline regression tests; never execute recovered application code."""
import contextlib
import hashlib
import io
import json
from pathlib import Path
import stat
import tempfile
import unittest
from unittest import mock
import warnings
import zipfile

from scripts import verify_recovery as recovery

REPO = Path(__file__).resolve().parents[1]


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.parts = self.root / "parts"
        self.parts.mkdir()
        self.buffer = io.BytesIO()
        with zipfile.ZipFile(self.buffer, "w") as archive:
            archive.writestr("recovered/", "")
            archive.writestr("recovered/backend/package.json", '{"name":"fixture"}')
        self.blob = self.buffer.getvalue()
        self.manifest = {
            "schemaVersion": 1, "artifact": "recovered.zip",
            "sha256": hashlib.sha256(self.blob).hexdigest(), "size": len(self.blob),
            "archiveRoot": "recovered/", "entries": 2, "files": 1,
            "uncompressedSize": len('{"name":"fixture"}'),
            "parts": [
                {"name": "part00", "size": 10, "sha256": hashlib.sha256(self.blob[:10]).hexdigest()},
                {"name": "part01", "size": len(self.blob) - 10, "sha256": hashlib.sha256(self.blob[10:]).hexdigest()},
            ],
        }
        (self.parts / "part00").write_bytes(self.blob[:10])
        (self.parts / "part01").write_bytes(self.blob[10:])
        self.manifest_path = self.root / "manifest.json"
        self.save_manifest()

    def save_manifest(self):
        self.manifest_path.write_text(json.dumps(self.manifest), encoding="utf-8")

    def zip_entries(self, entries):
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as archive:
            for entry in entries:
                if isinstance(entry, tuple):
                    name, data = entry
                    archive.writestr(name, data)
                else:
                    archive.writestr(entry, "data")
        with zipfile.ZipFile(io.BytesIO(buf.getvalue())) as archive:
            recovery.validate_zip(archive, self.manifest)

    def test_verify_without_retaining_archive(self):
        result = recovery.verify_parts(self.parts, self.manifest)
        self.assertEqual(result["sha256"], self.manifest["sha256"])
        self.assertEqual(result["crc"], "PASS")
        self.assertEqual({p.name for p in self.parts.iterdir()}, {"part00", "part01"})
        self.assertFalse((self.parts / "recovered.zip").exists())

    def test_output_and_safe_extraction(self):
        output = self.root / "out" / "recovered.zip"
        destination = self.root / "extracted"
        recovery.verify_parts(self.parts, self.manifest, output)
        recovery.extract_verified(output, self.manifest, destination)
        self.assertEqual((destination / "recovered/backend/package.json").read_text(), '{"name":"fixture"}')
        self.assertEqual(output.read_bytes(), self.blob)

    def test_existing_output_is_not_overwritten(self):
        output = self.root / "recovered.zip"
        output.write_bytes(b"keep")
        with self.assertRaisesRegex(recovery.RecoveryError, "already exists"):
            recovery.verify_parts(self.parts, self.manifest, output)
        self.assertEqual(output.read_bytes(), b"keep")

    def test_existing_extraction_is_not_overwritten(self):
        output = self.root / "recovered.zip"
        recovery.verify_parts(self.parts, self.manifest, output)
        destination = self.root / "destination"
        destination.mkdir()
        with self.assertRaisesRegex(recovery.RecoveryError, "already exists"):
            recovery.extract_verified(output, self.manifest, destination)
        self.assertEqual(list(destination.iterdir()), [])

    def test_corrupt_part_fails_before_output(self):
        (self.parts / "part01").write_bytes(b"x" * self.manifest["parts"][1]["size"])
        output = self.root / "recovered.zip"
        with self.assertRaisesRegex(recovery.RecoveryError, "Part SHA-256 mismatch"):
            recovery.verify_parts(self.parts, self.manifest, output)
        self.assertFalse(output.exists())

    def test_missing_and_truncated_parts_fail(self):
        (self.parts / "part00").unlink()
        with self.assertRaisesRegex(recovery.RecoveryError, "Missing"):
            recovery.verify_parts(self.parts, self.manifest)
        (self.parts / "part00").write_bytes(b"short")
        with self.assertRaisesRegex(recovery.RecoveryError, "size mismatch"):
            recovery.verify_parts(self.parts, self.manifest)

    def test_symlink_part_rejected(self):
        target = self.root / "target"
        target.write_bytes(self.blob[:10])
        (self.parts / "part00").unlink()
        (self.parts / "part00").symlink_to(target)
        with self.assertRaisesRegex(recovery.RecoveryError, "unsafe part"):
            recovery.verify_parts(self.parts, self.manifest)

    def test_traversal_absolute_backslash_and_special_names_rejected(self):
        for name in ("../escape", "/absolute", "recovered/../../escape", "recovered\\escape", "C:/escape", "recovered/NUL.txt", "recovered/file ", "recovered/\x01bad"):
            with self.subTest(name=name):
                self.assertFalse(recovery.safe_name(name, "recovered/"))

    def test_duplicate_entries_rejected(self):
        self.manifest.update(entries=2, files=2, uncompressedSize=8)
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", UserWarning)
            with self.assertRaisesRegex(recovery.RecoveryError, "Duplicate"):
                self.zip_entries(["recovered/backend/package.json", "recovered/backend/package.json"])

    def test_case_collisions_rejected(self):
        self.manifest.update(entries=2, files=2, uncompressedSize=8)
        with self.assertRaisesRegex(recovery.RecoveryError, "case-colliding file inventory"):
            self.zip_entries(["recovered/backend/package.json", "recovered/BACKEND/package.json"])

    def test_declared_identical_case_variants_extract_portably(self):
        self.manifest.update(entries=4, files=2, uncompressedSize=8,
                            caseInsensitiveDuplicateFiles=1, caseInsensitiveDuplicateDirectories=1)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as archive:
            for name in ("recovered/Backend/", "recovered/backend/",
                         "recovered/Backend/package.json", "recovered/backend/package.json"):
                archive.writestr(name, "" if name.endswith("/") else "data")
        blob = buf.getvalue()
        (self.root / "case.zip").write_bytes(blob)
        self.manifest.update(artifact="case.zip", size=len(blob), sha256=hashlib.sha256(blob).hexdigest())
        output = self.root / "case.zip"
        destination = self.root / "case-extracted"
        recovery.extract_verified(output, self.manifest, destination)
        files = [p for p in destination.rglob("*") if p.is_file()]
        self.assertEqual(len(files), 1)
        self.assertEqual({p.name for p in files}, {"package.json"})
        self.manifest["caseInsensitiveDuplicateFiles"] = 0
        with zipfile.ZipFile(buf) as archive, self.assertRaisesRegex(recovery.RecoveryError, "case-colliding file inventory"):
            recovery.validate_zip(archive, self.manifest)

    def test_different_case_variants_rejected_even_when_declared(self):
        self.manifest.update(entries=2, files=2, uncompressedSize=8, caseInsensitiveDuplicateFiles=1)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as archive:
            archive.writestr("recovered/backend/package.json", "data")
            archive.writestr("recovered/BACKEND/package.json", "DIFF")
        with zipfile.ZipFile(buf) as archive, self.assertRaisesRegex(recovery.RecoveryError, "Case-colliding content"):
            recovery.validate_zip(archive, self.manifest)

    def test_symlink_zip_entry_rejected(self):
        self.manifest.update(entries=1, files=1, uncompressedSize=12)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as archive:
            info = zipfile.ZipInfo("recovered/backend/package.json")
            info.create_system = 3
            info.external_attr = (stat.S_IFLNK | 0o777) << 16
            archive.writestr(info, "../../escape")
        with zipfile.ZipFile(buf) as archive, self.assertRaisesRegex(recovery.RecoveryError, "Special ZIP"):
            recovery.validate_zip(archive, self.manifest)

    def test_crc_failure_rejected(self):
        blob = bytearray(self.blob)
        index = blob.index(b'{"name":"fixture"}')
        blob[index] ^= 1
        with zipfile.ZipFile(io.BytesIO(blob)) as archive, self.assertRaisesRegex(recovery.RecoveryError, "CRC failure"):
            recovery.validate_zip(archive, self.manifest)

    def test_inventory_mismatch_rejected(self):
        self.manifest["files"] = 2
        with self.assertRaisesRegex(recovery.RecoveryError, "file count"):
            recovery.validate_zip(zipfile.ZipFile(self.buffer), self.manifest)

    def test_wrong_archive_hash_rejected_without_extraction(self):
        output = self.root / "recovered.zip"
        recovery.verify_parts(self.parts, self.manifest, output)
        self.manifest["sha256"] = "0" * 64
        with self.assertRaisesRegex(recovery.RecoveryError, "SHA-256 mismatch"):
            recovery.extract_verified(output, self.manifest, self.root / "extract")
        self.assertFalse((self.root / "extract").exists())

    def test_invalid_manifest_rejected(self):
        self.manifest["parts"][0]["name"] = "../escape"
        self.save_manifest()
        with self.assertRaisesRegex(recovery.RecoveryError, "filename"):
            recovery.load_manifest(self.manifest_path)

    def test_cli_requires_output_for_extraction(self):
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(recovery.main(["--extract", str(self.root / "out")]), 1)

    def test_cli_failure_has_nonzero_exit(self):
        (self.parts / "part00").unlink()
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(recovery.main(["--parts-dir", str(self.parts), "--manifest", str(self.manifest_path)]), 1)

    def test_cross_filesystem_fallback_is_exclusive(self):
        for part in self.manifest["parts"]:
            (self.parts / part["name"]).rename(self.root / part["name"])
        self.parts = self.root
        output = self.root / "output" / "out.zip"
        with mock.patch.object(recovery.os, "link", side_effect=OSError("EXDEV")):
            recovery.verify_parts(self.parts, self.manifest, output)
        self.assertEqual(output.read_bytes(), self.blob)
        with mock.patch.object(recovery.os, "link", side_effect=OSError("EXDEV")):
            with self.assertRaisesRegex(recovery.RecoveryError, "already exists"):
                recovery.verify_parts(self.parts, self.manifest, output)
        self.assertEqual(output.read_bytes(), self.blob)


class RepositoryContractTests(unittest.TestCase):
    def test_real_manifest_matches_parts_and_checksum_files(self):
        manifest = recovery.load_manifest(REPO / "recovery-manifest.json")
        for part in manifest["parts"]:
            path = REPO / part["name"]
            self.assertEqual(path.stat().st_size, part["size"])
            with path.open("rb") as stream:
                self.assertEqual(hashlib.file_digest(stream, "sha256").hexdigest(), part["sha256"])
        self.assertIn(manifest["sha256"], (REPO / "AI-Syed-Jalal-Master.sha256").read_text())
        # This deliberately different checksum identifies the UPDATED release ZIP,
        # not the original archive reconstructed from these repository parts.
        updated = (REPO / "AI-Syed-Jalal-MASTER-RECOVERY-UPDATED-2026-10-11.sha256").read_text()
        self.assertNotIn(manifest["sha256"], updated)
        self.assertIn("19333acbe525cbdbc1c048840679a3d47927a27eeafb2fe025f9dca94b21f712", updated)

    def test_windows_merger_uses_reconstructed_archive_hash_and_checks_result(self):
        manifest = json.loads((REPO / "recovery-manifest.json").read_text())
        batch = (REPO / "AI-Syed-Jalal-GitHub-MERGE-PARTS-WINDOWS.bat").read_text()
        self.assertIn(manifest["sha256"], batch.lower())
        self.assertIn("certutil", batch.lower())
        self.assertIn('if /i not "!actual!"', batch.lower())
        self.assertIn("pushd", batch.lower())
        self.assertNotIn("19333acbe", batch)
        for part in manifest["parts"]:
            self.assertIn(part["name"], batch)

    def test_stale_mutation_automation_is_retired(self):
        self.assertFalse((REPO / "scripts/sync-recovery-updates.py").exists())
        self.assertFalse((REPO / ".github/workflows/sync-recovery-updates-v2.yml").exists())
        self.assertFalse((REPO / ".github/workflows/recover-extracted-source.yml").exists())
        workflow = (REPO / ".github/workflows/verify-recovery.yml").read_text()
        self.assertIn("contents: read", workflow)
        self.assertIn("python scripts/verify_recovery.py", workflow)
        self.assertIn("python -m unittest discover -s tests -v", workflow)
        self.assertNotIn("git push", workflow)


if __name__ == "__main__":
    unittest.main()

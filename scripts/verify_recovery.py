#!/usr/bin/env python3
"""Verify recovery parts without executing anything from the recovered archive.

With no output options, stream the parts through SHA-256 and validate ZIP metadata,
CRCs and inventory in memory. Use --output to retain a verified ZIP, or --extract
to also extract it into a new directory. Existing outputs are never overwritten.
Python 3.10+ for the verifier; Python 3.11+ for the test suite. Standard library only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import sys
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
CHUNK = 1024 * 1024
MAX_ENTRIES = 20_000
MAX_UNCOMPRESSED = 1024 * 1024 * 1024


class RecoveryError(Exception):
    """An actionable integrity or safety failure (no traceback required)."""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RecoveryError(message)


def load_manifest(path: Path) -> dict:
    manifest = json.loads(path.read_text(encoding="utf-8"))
    require(manifest.get("schemaVersion") == 1, "Unsupported manifest schema")
    for key in ("artifact", "archiveRoot"):
        require(isinstance(manifest.get(key), str) and bool(manifest[key]), f"Invalid {key}")
    require(Path(manifest["artifact"]).name == manifest["artifact"] and safe_path(manifest["artifact"]), "Artifact must be a safe filename")
    require(re.fullmatch(r"[a-f0-9]{64}", manifest.get("sha256", "")) is not None, "Invalid archive SHA-256")
    require(manifest["archiveRoot"].endswith("/") and safe_name(manifest["archiveRoot"][:-1], manifest["archiveRoot"]), "Invalid archive root")
    for key in ("size", "entries", "files", "uncompressedSize"):
        require(type(manifest.get(key)) is int and manifest[key] > 0, f"Invalid {key}")
    require(manifest["files"] <= manifest["entries"] <= MAX_ENTRIES, "Invalid entry counts")
    require(manifest["uncompressedSize"] <= MAX_UNCOMPRESSED, "Uncompressed inventory exceeds safety limit")
    require(manifest["size"] <= MAX_UNCOMPRESSED, "Archive exceeds safety limit")
    for key, maximum in (("caseInsensitiveDuplicateFiles", manifest["files"]), ("caseInsensitiveDuplicateDirectories", manifest["entries"] - manifest["files"])):
        value = manifest.get(key, 0)
        require(type(value) is int and 0 <= value <= maximum, f"Invalid {key}")
    parts = manifest.get("parts")
    require(isinstance(parts, list) and bool(parts), "Manifest has no parts")
    names = set()
    for part in parts:
        name = part.get("name", "")
        require(isinstance(name, str) and Path(name).name == name and safe_path(name), "Invalid part filename")
        require(name not in names, f"Duplicate part: {name}")
        names.add(name)
        require(re.fullmatch(r"[a-f0-9]{64}", part.get("sha256", "")) is not None, f"Invalid hash: {name}")
        require(type(part.get("size")) is int and part["size"] > 0, f"Invalid size: {name}")
    require(sum(p["size"] for p in parts) == manifest["size"], "Part sizes do not equal archive size")
    return manifest


def safe_path(name: str) -> bool:
    """Reject traversal, absolute paths and Windows-ambiguous path components."""
    if not name or "\\" in name or any(ord(c) < 32 or ord(c) == 127 for c in name):
        return False
    path = PurePosixPath(name)
    if path.is_absolute() or ":" in name or str(path) != name.rstrip("/"):
        return False
    if any(part in (".", "..", "") for part in name.rstrip("/").split("/")):
        return False
    # These names are ambiguous on Windows, even when extraction runs on Linux.
    if any(p.rstrip(" .") != p or re.match(r"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)", p, re.I) for p in path.parts):
        return False
    return True


def safe_name(name: str, archive_root: str) -> bool:
    return safe_path(name) and (name == archive_root.rstrip("/") or name.startswith(archive_root))


def _parents(path: str):
    parts = path.split("/")
    for length in range(1, len(parts)):
        yield "/".join(parts[:length])


def validate_zip(archive: zipfile.ZipFile, manifest: dict) -> None:
    infos = archive.infolist()
    require(len(infos) == manifest["entries"], "ZIP entry count differs from manifest")
    files = [i for i in infos if not i.is_dir()]
    require(len(files) == manifest["files"], "ZIP file count differs from manifest")
    require(sum(i.file_size for i in infos) == manifest["uncompressedSize"], "Uncompressed size differs from manifest")
    names = set()
    folded = {}
    file_paths = set()
    duplicate_files = duplicate_directories = 0
    for info in infos:
        name = info.filename
        require(safe_name(name, manifest["archiveRoot"]), f"Unsafe ZIP path: {name!r}")
        require(name not in names, f"Duplicate ZIP entry: {name}")
        names.add(name)
        mode = info.external_attr >> 16
        kind = stat.S_IFMT(mode)
        require(kind in (0, stat.S_IFREG, stat.S_IFDIR), f"Special ZIP entry rejected: {name}")
        require((kind == stat.S_IFDIR) == info.is_dir(), f"Directory/file type mismatch: {name}")
        require(not (info.flag_bits & 1), f"Encrypted ZIP entry rejected: {name}")
        normalized = name.rstrip("/").casefold()
        if not info.is_dir():
            file_paths.add(normalized)
            require(not any(normalized.startswith(parent + "/") for parent in file_paths), f"File/directory collision: {name}")
        else:
            require(normalized not in file_paths, f"Directory/file collision: {name}")
        previous = folded.get(normalized)
        if previous is not None:
            # Historical upstream imports contain identical Superpowers trees
            # differing only in directory capitalization. Allow only the exact,
            # byte-identical inventory recorded in the verified manifest.
            require(previous.is_dir() == info.is_dir(), f"Case-colliding entry types: {name}")
            if info.is_dir():
                duplicate_directories += 1
            else:
                require(previous.file_size == info.file_size, f"Case-colliding content: {name}")
                with archive.open(previous) as a, archive.open(info) as b:
                    while True:
                        a_chunk, b_chunk = a.read(CHUNK), b.read(CHUNK)
                        require(a_chunk == b_chunk, f"Case-colliding content: {name}")
                        if not a_chunk:
                            break
                duplicate_files += 1
        folded[normalized] = info
    require(duplicate_files == manifest.get("caseInsensitiveDuplicateFiles", 0), "Unexpected case-colliding file inventory")
    require(duplicate_directories == manifest.get("caseInsensitiveDuplicateDirectories", 0), "Unexpected case-colliding directory inventory")
    require(not any(any(parent in file_paths for parent in _parents(path)) for path in file_paths), "File/directory collision")
    require(manifest["archiveRoot"] + "backend/package.json" in names, "Recovered backend package is missing")
    bad = archive.testzip()
    require(bad is None, f"ZIP CRC failure: {bad}")


def open_verified_zip(path: Path, manifest: dict) -> zipfile.ZipFile:
    require(path.is_file() and not path.is_symlink(), f"Not a regular archive: {path}")
    require(path.stat().st_size == manifest["size"], "Archive size differs from manifest")
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(CHUNK):
            digest.update(chunk)
    require(digest.hexdigest() == manifest["sha256"], "Archive SHA-256 mismatch")
    try:
        with zipfile.ZipFile(path) as archive:
            validate_zip(archive, manifest)
    except (zipfile.BadZipFile, NotImplementedError, RuntimeError) as exc:
        raise RecoveryError(f"Invalid ZIP: {exc}") from exc
    return zipfile.ZipFile(path)


def verify_parts(directory: Path, manifest: dict, output: Path | None = None) -> dict:
    for part in manifest["parts"]:
        path = directory / part["name"]
        require(path.is_file() and not path.is_symlink(), f"Missing or unsafe part: {part['name']}")
        require(path.stat().st_size == part["size"], f"Part size mismatch: {part['name']}")
    if output is not None:
        require(not output.exists() and not output.is_symlink(), f"Output already exists: {output}")
        output.parent.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    total = 0
    # A unique sibling is published with link() only after every check passes.
    # Unlike replace(), link() cannot clobber a destination created concurrently.
    with tempfile.TemporaryDirectory(prefix=".recovery-", dir=output.parent if output else None) as tmp:
        candidate = Path(tmp) / manifest["artifact"]
        with candidate.open("xb") as target:
            for part in manifest["parts"]:
                part_digest = hashlib.sha256()
                size = 0
                with (directory / part["name"]).open("rb") as source:
                    while chunk := source.read(CHUNK):
                        target.write(chunk); digest.update(chunk); part_digest.update(chunk); size += len(chunk)
                require(size == part["size"], f"Part changed during verification: {part['name']}")
                require(part_digest.hexdigest() == part["sha256"], f"Part SHA-256 mismatch: {part['name']}")
                total += size
        require(total == manifest["size"], "Reconstructed size mismatch")
        require(digest.hexdigest() == manifest["sha256"], "Reconstructed archive SHA-256 mismatch")
        with open_verified_zip(candidate, manifest):
            pass
        if output is not None:
            try:
                os.link(candidate, output)
            except OSError:
                # Cross-filesystem or unsupported hard-link case: exclusive copy.
                try:
                    destination = output.open("xb")
                except FileExistsError as exc:
                    raise RecoveryError(f"Output already exists: {output}") from exc
                try:
                    with candidate.open("rb") as src, destination:
                        shutil.copyfileobj(src, destination, CHUNK)
                except BaseException:
                    # Only clean up a file this invocation exclusively created.
                    output.unlink(missing_ok=True)
                    raise
        else:
            candidate.unlink()
    return {"sha256": digest.hexdigest(), "size": total, "entries": manifest["entries"], "files": manifest["files"], "crc": "PASS"}


def extract_verified(archive_path: Path, manifest: dict, destination: Path) -> None:
    require(not destination.exists() and not destination.is_symlink(), f"Extraction destination already exists: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".extract-", dir=destination.parent))
    try:
        with open_verified_zip(archive_path, manifest) as archive:
            canonical = {}
            extracted = set()
            for info in archive.infolist():
                parts = []
                prefix = []
                for component in PurePosixPath(info.filename.rstrip("/")).parts:
                    prefix.append(component)
                    key = "/".join(prefix).casefold()
                    parts.append(canonical.setdefault(key, component))
                target = staging.joinpath(*parts)
                if info.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                    continue
                normalized = info.filename.casefold()
                if normalized in extracted:
                    # validate_zip has proved these entries byte-identical.
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(info) as src, target.open("xb") as dst:
                    shutil.copyfileobj(src, dst, CHUNK)
                # Deliberately do not restore setuid/setgid or arbitrary ZIP modes.
                target.chmod(0o755 if (info.external_attr >> 16) & 0o111 else 0o644)
                extracted.add(normalized)
        require(not destination.exists(), f"Extraction destination already exists: {destination}")
        staging.rename(destination)
    finally:
        if staging.exists():
            shutil.rmtree(staging)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--parts-dir", type=Path, default=ROOT)
    parser.add_argument("--manifest", type=Path, default=ROOT / "recovery-manifest.json")
    parser.add_argument("--output", type=Path, help="Save a verified ZIP to a new path")
    parser.add_argument("--extract", type=Path, help="Extract into a new directory (requires --output)")
    args = parser.parse_args(argv)
    try:
        require(args.extract is None or args.output is not None, "--extract requires --output")
        manifest = load_manifest(args.manifest)
        result = verify_parts(args.parts_dir, manifest, args.output)
        if args.extract is not None:
            extract_verified(args.output, manifest, args.extract)
            result["extracted"] = str(args.extract)
        print(json.dumps(result, indent=2))
        print("RECOVERY VERIFIED: integrity only; not a security or production-readiness certification.")
        return 0
    except (RecoveryError, OSError, ValueError, zipfile.BadZipFile) as exc:
        print(f"RECOVERY FAILED: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

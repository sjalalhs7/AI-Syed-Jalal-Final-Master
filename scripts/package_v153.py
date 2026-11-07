#!/usr/bin/env python3
"""Create the V153 source and explicitly static website archives from tracked files.

Run from a Git checkout after staging intended new files. Historical recovery
parts, other archives, runtime data, dependencies and credentials are excluded.
The standalone website is deliberately static on every host; use the source
archive for a backend deployment.
"""
from __future__ import annotations

import hashlib
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
APP = Path('source/AI-Syed-Jalal-FINAL-RECOVERED')
FRONTEND = APP / 'frontend'
OUT = ROOT / 'dist'
PREFIX = 'AI-Syed-Jalal-FINAL-V153/'
STAMP = (2026, 11, 7, 0, 0, 0)


def tracked_files() -> list[Path]:
    result = subprocess.run(['git', 'ls-files', '-z'], cwd=ROOT, check=True, stdout=subprocess.PIPE)
    return [Path(value.decode('utf-8')) for value in result.stdout.split(b'\0') if value]


def safe_source(path: Path) -> bool:
    parts = path.parts
    name = path.name
    if not parts or parts[0] == 'dist' or name.startswith('AI-Syed-Jalal-Master.part'):
        return False
    if any(part in {'.git', '.data', 'node_modules', 'test-results', 'playwright-report', '__pycache__'} for part in parts):
        return False
    if name.startswith('.env') and not name.endswith('.example'):
        return False
    source = ROOT / path
    return source.is_file() and not source.is_symlink()


def write_entry(archive: zipfile.ZipFile, name: str, content: bytes) -> None:
    if name.startswith('/') or '..' in Path(name).parts or '\\' in name:
        raise ValueError(f'Unsafe archive path: {name}')
    info = zipfile.ZipInfo(name, STAMP)
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o100644 << 16
    archive.writestr(info, content, compresslevel=9)


def create() -> None:
    files = sorted((path for path in tracked_files() if safe_source(path)), key=lambda path: path.as_posix())
    required = [Path('README.md'), Path('START-HERE.md'), Path('V153-JARVIS-CONVERSATION-2026-11-07.md'),
                APP / 'frontend/functions/spoken-arithmetic.mjs', APP / 'tests/browser/jarvis-conversation.spec.mjs']
    missing = [path.as_posix() for path in required if path not in files]
    if missing:
        raise SystemExit('Stage intended new files first; missing: ' + ', '.join(missing))
    OUT.mkdir(exist_ok=True)
    source_file = OUT / 'AI-Syed-Jalal-FINAL-V153-source.zip'
    website_file = OUT / 'AI-Syed-Jalal-Website-V153-SJS-static.zip'
    with zipfile.ZipFile(source_file, 'w') as archive:
        for path in files:
            write_entry(archive, PREFIX + path.as_posix(), (ROOT / path).read_bytes())

    static_readme = b'''AI-Syed Jalal V153 - static website only\n\nExtract into a static host's web root. This package deliberately disables\nbackend-dependent features: sign-in, saved data and cloud AI require the\nseparate V153 source application and a configured server/database.\n\nThis package cannot be converted to the full application merely by adding\nkeys. See START-HERE.md in the source archive for setup and limitations.\n'''
    with zipfile.ZipFile(website_file, 'w') as archive:
        write_entry(archive, 'README-STATIC.txt', static_readme)
        for path in files:
            try:
                relative = path.relative_to(FRONTEND)
            except ValueError:
                continue
            # No executable backend, tests, build tools or package manifests are
            # required in the standalone website-only package.
            if relative.parts[0] in {'functions', 'tests', 'scripts'} or relative.name in {'package.json', 'package-lock.json', 'wrangler.toml'}:
                continue
            content = (ROOT / path).read_bytes()
            if relative.as_posix() == 'assets/host-mode.js':
                before = b'const STATIC_PACKAGE = false;'
                assert content.count(before) == 1
                content = content.replace(before, b'const STATIC_PACKAGE = true;')
            elif relative.as_posix() == 'sw.js':
                before = b"const CACHE='aj-v153-shell';"
                assert content.count(before) == 1
                content = content.replace(before, b"const CACHE='aj-v153-static-shell';")
            write_entry(archive, relative.as_posix(), content)

    checksums = []
    for path in (source_file, website_file):
        with zipfile.ZipFile(path) as archive:
            bad = archive.testzip()
            if bad:
                raise RuntimeError(f'{path.name}: CRC error at {bad}')
            print(f'{path.name}: {len(archive.namelist())} files, {path.stat().st_size} bytes')
        checksums.append(f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n')
    (OUT / 'SHA256SUMS-V153.txt').write_text(''.join(checksums), encoding='utf-8')


if __name__ == '__main__':
    create()

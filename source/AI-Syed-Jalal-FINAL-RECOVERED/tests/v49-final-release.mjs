import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const required = [
  '.editorconfig', 'SECURITY.md', 'CONTRIBUTING.md', 'CHANGELOG.md',
  'README-V49-FINAL.md', 'V49-FINAL-ENGINEERING-MANIFEST.txt',
  'docs/architecture/README.md', 'docs/deployment/README.md',
  'docs/security/README.md', 'docs/operations/README.md',
  'docs/user-guide/README.md', 'docs/RELEASE-CHECKLIST-V49.md',
  '.github/workflows/quality.yml', '.github/workflows/security.yml',
  '.github/workflows/pages.yml'
];
for (const rel of required) {
  if (!fs.existsSync(path.join(root, rel))) throw new Error(`Missing V49 file: ${rel}`);
}
const forbidden = ['.github/workflows/pages-v37.yml', '.github/workflows/pages-v38.yml', '.github/workflows/pages-v40.yml', '.github/workflows/ci.yml'];
for (const rel of forbidden) {
  if (fs.existsSync(path.join(root, rel))) throw new Error(`Obsolete workflow remains: ${rel}`);
}
const readme = fs.readFileSync(path.join(root, 'README-V49-FINAL.md'), 'utf8');
if (!readme.includes('V49') || !readme.includes('deployment environment')) throw new Error('V49 release truth statement missing');
console.log('V49 final release validation: PASS');

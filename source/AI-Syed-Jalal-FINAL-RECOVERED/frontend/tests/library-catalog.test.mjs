import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(await readFile(path.join(here, '../config/library-catalog.json'), 'utf8'));
const route = await readFile(path.join(here, '../functions/api/[[path]].js'), 'utf8');
const dashboard = await readFile(path.join(here, '../dashboard.html'), 'utf8');
test('library catalog has all 3,500 unique expert skill profiles', () => {
  assert.equal(catalog.count, 3500);
  assert.equal(catalog.skills.length, 3500);
  assert.equal(new Set(catalog.skills.map(x => x.id)).size, 3500);
  assert.equal(catalog.domains.length, 35);
});
test('library retains imported Superpowers skills, templates, and source status', () => {
  assert.ok(catalog.superpowers_skills.length >= 1);
  assert.ok(catalog.templates.length >= 1);
  assert.ok(Object.keys(catalog.sources).length >= 1);
});
test('authenticated API returns catalogue data rather than empty arrays', () => {
  assert.match(route, /import libraryCatalog from '\.\.\/\.\.\/config\/library-catalog\.json'/);
  assert.match(route, /skills:libraryCatalog\.skills/);
  assert.doesNotMatch(route, /return reply\(\{superpowers_skills:\[\],templates:\[\],sources:\{\}\}\)/);
});
test('dashboard lets users search the 3,500-skill registry', () => {
  assert.match(dashboard, /value="registry">Expert AI Skills \(3,500\)/);
  assert.match(dashboard, /lib\.skills\.filter/);
  assert.match(dashboard, /matches\.slice\(0,200\)/);
});

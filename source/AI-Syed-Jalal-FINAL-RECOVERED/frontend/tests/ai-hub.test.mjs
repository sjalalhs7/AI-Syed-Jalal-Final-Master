import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { CATEGORIES, EXPERIENCES, STARTERS, PROVIDERS, selectSkills, filterSkills, filterExperiences, skillPrompt } from '../assets/ai-hub-data.js';

const root = new URL('../', import.meta.url);
const index = JSON.parse(readFileSync(new URL('config/agent-skill-index.json', root), 'utf8'));

test('hub selects 190 real reference skills evenly across all 35 domains and distinct families', () => {
  const selected = selectSkills(index);
  assert.equal(selected.length, 190);
  assert.deepEqual(selected, selectSkills(index), 'selection is deterministic');
  assert.equal(new Set(selected.map(item => item.id)).size, 190);
  assert.equal(new Set(selected.map(item => item.domain)).size, 35);
  const source = new Map(index.skills.map(([id, name, domain, family]) => [id, { id, name, domain, family }]));
  for (const skill of selected) assert.deepEqual(skill, source.get(skill.id));
  for (const { name } of index.domains) {
    const subset = selected.filter(item => item.domain === name);
    assert.ok(subset.length >= 5 && subset.length <= 6, name);
    assert.equal(new Set(subset.map(item => item.family)).size, subset.length, name + ' repeats a family');
  }
});

test('skill selection is bounded and tolerates an incomplete or malformed index', () => {
  assert.deepEqual(selectSkills(null), []);
  assert.deepEqual(selectSkills({ domains: [], skills: [] }), []);
  assert.deepEqual(selectSkills(index, 0), []);
  assert.equal(selectSkills(index, 12).length, 12);
  const partial = { domains: [{ name: 'A' }, { name: 'B' }], skills: [['one', 'First', 'A', 'alpha'], ['one', 'Duplicate', 'A', 'beta'], ['bad'], ['two', 'Second', 'B', 'bravo']] };
  assert.deepEqual(selectSkills(partial).map(item => item.id), ['one', 'two']);
});

test('skill search combines case-insensitive words with the selected domain', () => {
  const selected = selectSkills(index);
  const cybersecurity = filterSkills(selected, 'security', 'Cybersecurity');
  assert.ok(cybersecurity.length >= 5);
  assert.ok(cybersecurity.every(item => item.domain === 'Cybersecurity'));
  assert.deepEqual(filterSkills(selected, 'SECURITY', 'Cybersecurity'), cybersecurity);
  assert.equal(filterSkills(selected, 'no-such-skill').length, 0);
  const chosen = cybersecurity[0];
  assert.deepEqual(filterSkills(selected, chosen.id), [chosen]);
  assert.match(skillPrompt(chosen), /plan: Help me apply/);
  assert.match(skillPrompt(chosen), /Do not claim to have performed an external action/);
});

test('all categories filter, every linked destination exists, and unavailable generation is labelled', () => {
  assert.equal(filterExperiences('all').length, EXPERIENCES.length);
  for (const category of CATEGORIES.slice(1)) assert.ok(filterExperiences(category.id).length > 0, category.label);
  assert.equal(filterExperiences('music')[0].status, 'Music generation not connected');
  assert.match(filterExperiences('image')[0].status, /local photo editor/i);
  assert.match(filterExperiences('image')[0].description, /generation not connected/i);
  assert.match(filterExperiences('video')[0].status, /local video trimming/i);
  assert.match(filterExperiences('video')[0].description, /generation are not connected/i);
  assert.equal(filterExperiences('all', 'JSON')[0].id, 'coding');
  assert.equal(filterExperiences('code', 'music').length, 0);
  for (const item of EXPERIENCES) {
    assert.ok(item.input && item.output && item.limit, item.id);
    if (item.action.type === 'link' && !item.action.href.startsWith('#')) assert.ok(existsSync(new URL(item.action.href, root)), item.action.href);
    else if (item.action.type === 'prompt') assert.ok(item.action.prompt.includes('[add details]'), item.id);
  }
  assert.equal(STARTERS.length, 5);
  assert.equal(PROVIDERS.length, 5);
});

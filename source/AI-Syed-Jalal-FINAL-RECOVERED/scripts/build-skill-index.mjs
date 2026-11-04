// Generates the compact agent skill index served by /api/agent/skills.
// The full 3,500-skill catalogue stays the source of truth; this index keeps
// the worker bundle small by storing only id/name/domain/family/capability.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(root, 'frontend/config/library-catalog.json');
const target = resolve(root, 'frontend/config/agent-skill-index.json');

const catalog = JSON.parse(await readFile(source, 'utf8'));
const skills = (catalog.skills || []).map(skill => [
  String(skill.id || '').slice(0, 120),
  String(skill.name || '').slice(0, 200),
  String(skill.domain || '').slice(0, 120),
  String(skill.family || '').slice(0, 120),
  String(skill.capability || 'expert').slice(0, 40)
]);
const domains = (catalog.domains || []).map(domain => ({
  name: String(domain.name || '').slice(0, 120),
  skillCount: Number(domain.skill_count || 0),
  families: (domain.families || []).map(family => String(family).slice(0, 120)).slice(0, 24)
}));
const index = {
  version: 'V133',
  generatedFrom: 'frontend/config/library-catalog.json',
  count: skills.length,
  domainCount: domains.length,
  domains,
  // [id, name, domain, family, capability]
  skills
};
await writeFile(target, JSON.stringify(index));
console.log(`Wrote ${skills.length} skills across ${domains.length} domains to ${target}`);

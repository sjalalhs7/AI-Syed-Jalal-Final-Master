import test from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const online = join(root, 'deployment/online');
const read = path => readFileSync(join(online, path), 'utf8');

test('legacy self-hosted production API does not migrate or seed on restart', () => {
  const compose = read('docker-compose.production.yml');
  const api = compose.split('\n  api:\n')[1]?.split('\n  seed:\n')[0];
  assert.ok(api, 'find the API service');
  assert.match(api, /command:\s*\[\s*"node",\s*"server\.mjs"\s*\]/);
  assert.doesNotMatch(api, /scripts\/(migrate|seed)\.mjs/);
  assert.doesNotMatch(api, /SEED_ADMIN_PASSWORD/);
  const seed = compose.split('\n  seed:\n')[1]?.split('\n  web:\n')[0];
  assert.match(seed, /profiles:\s*\["seed"\]/, 'seeding remains a separate explicit operation');
});

test('legacy deployment helper does not run a migration or create an Admin', { skip: process.platform === 'win32' ? 'requires Bash' : false }, t => {
  // Fake Docker and local dummy values only; no real deployment or DB access.
  const dir = mkdtempSync(join(tmpdir(), 'aj-deploy-safety-'));
  t.after(() => rmSync(dir, { recursive:true, force:true }));
  mkdirSync(join(dir, 'bin'));
  copyFileSync(join(online, 'deploy.sh'), join(dir, 'deploy.sh'));
  writeFileSync(join(dir, '.env.production'), 'PUBLIC_ORIGIN=https://example.invalid\nDATABASE_URL=postgresql://dummy:private@invalid.example/fixture\nCSRF_SECRET=dummy-private-value\n');
  writeFileSync(join(dir, 'bin/docker'), '#!/usr/bin/env bash\nprintf "%s\\n" "$*" >> "$FAKE_DOCKER_LOG"\n', { mode:0o755 });
  const log = join(dir, 'docker.log');
  const result = spawnSync('bash', [join(dir, 'deploy.sh')], {
    cwd:dir, encoding:'utf8', env:{ ...process.env, PATH:`${join(dir, 'bin')}:${process.env.PATH}`, FAKE_DOCKER_LOG:log }
  });
  assert.equal(result.status, 0, result.stderr);
  const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
  assert.equal(calls.length, 2);
  assert.match(calls[0], / build api$/);
  assert.match(calls[1], / up -d api web$/);
  assert.doesNotMatch(calls.join('\n'), /migrate|seed|private/);
  assert.doesNotMatch(result.stdout + result.stderr, /dummy:private|dummy-private-value/);
  assert.match(result.stdout, /not.*migrat|no migrations/i);
  assert.match(result.stdout, /not.*seed|no admin/i);
});

test('legacy migration help warns about backup instead of encouraging inline credentials', () => {
  const migration = readFileSync(join(root, 'backend/scripts/migrate.mjs'), 'utf8');
  assert.match(migration, /restorable full database backup/i);
  assert.match(migration, /isolated/i);
  assert.doesNotMatch(migration, /DATABASE_URL="postgresql:\/\//);
});

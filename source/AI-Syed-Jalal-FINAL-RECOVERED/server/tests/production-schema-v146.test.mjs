import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const root = new URL('../../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');

// The live Cloudflare deployment reported schemaTables:13 and refused sign-in
// because the Neon database was never migrated. These tests run the exact files
// the migration script runs, so a missing table is caught here instead of in
// production.
const REQUIRED = [
  'app_users', 'sessions', 'records', 'audit_events', 'record_history', 'documents',
  'approvals', 'ai_runs', 'auth_rate_limits', 'assistant_tasks', 'assistant_notes',
  'platform_conversations', 'platform_messages', 'agent_skills', 'agent_self_checks',
  'arena_battles', 'arena_responses', 'arena_artifacts', 'arena_ratings',
  'agent_runs', 'expert_reviews'
];

test('schema.sql plus every migration creates all 21 tables the app requires', async () => {
  const db = await PGlite.create();
  try {
    await db.exec(read('backend/db/schema.sql'));
    const files = readdirSync(new URL('backend/db/migrations/', root))
      .filter(f => f.endsWith('.sql')).sort();
    for (const file of files) {
      await db.exec(readFileSync(new URL('backend/db/migrations/' + file, root), 'utf8'));
    }
    const rows = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    const have = new Set(rows.rows.map(r => r.table_name));
    const missing = REQUIRED.filter(t => !have.has(t));
    assert.deepEqual(missing, [], `the migration path does not create: ${missing.join(', ')}`);
  } finally {
    await db.close();
  }
});

test('the migrate script explains itself instead of throwing a stack trace', () => {
  const script = read('backend/scripts/migrate.mjs');
  // No DATABASE_URL must produce an instruction, not ECONNREFUSED at localhost.
  assert.match(script, /DATABASE_URL is not set/);
  assert.match(script, /npm run db:migrate/);
  // A refused connection must say which host and that nothing changed.
  assert.match(script, /Nothing was changed/);
  assert.match(script, /Could not connect to the database at/);
});

test('package.json exposes the migration as npm run db:migrate', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['db:migrate'], 'node backend/scripts/migrate.mjs');
  assert.ok(pkg.devDependencies?.pg, 'pg must be a dependency for the migration to run');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { SCHEMA_PARTS, REQUIRED_TABLES, destructiveStatements } from '../../frontend/functions/schema-bundle.mjs';
import { splitSqlStatements, runPart } from '../../frontend/functions/schema-repair.mjs';

const root = new URL('../../', import.meta.url);

test('the bundled schema repairs a database missing the newer tables', async () => {
  // Reproduces the live deployment exactly: a database that only has the 13 older
  // tables, which is what /api/ready reported in production (schemaTables:13).
  const LIVE_HAS = ['app_users','sessions','records','audit_events','record_history',
    'documents','approvals','ai_runs','auth_rate_limits','assistant_tasks',
    'assistant_notes','platform_conversations','platform_messages'];
  const missingNames = REQUIRED_TABLES.filter(t => !LIVE_HAS.includes(t));
  assert.ok(missingNames.length > 0, 'the fixture must start incomplete');

  const db = await PGlite.create();
  try {
    for (const part of SCHEMA_PARTS) await db.exec(part.sql);
    // Drop the 8 to recreate the production state.
    for (const t of missingNames) await db.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
    const before = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    const haveBefore = before.rows.map(r => r.table_name);
    assert.deepEqual(REQUIRED_TABLES.filter(t => !haveBefore.includes(t)).sort(), missingNames.sort());

    for (const part of SCHEMA_PARTS) await db.exec(part.sql);
    const after = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
    const haveAfter = after.rows.map(r => r.table_name);
    assert.deepEqual(REQUIRED_TABLES.filter(t => !haveAfter.includes(t)), [],
      'repair did not restore every missing table');
    // Sign-in must keep working: the account tables were never dropped.
    assert.ok(haveAfter.includes('app_users') && haveAfter.includes('sessions'));
  } finally { await db.close(); }
});

test('the bundle contains no destructive SQL', () => {
  for (const part of SCHEMA_PARTS) {
    assert.deepEqual(destructiveStatements(part.sql), [], `${part.name} is not additive-only`);
  }
});

test('replaying the whole bundle is a no-op', async () => {
  const db = await PGlite.create();
  try {
    for (const part of SCHEMA_PARTS) await db.exec(part.sql);
    for (const part of SCHEMA_PARTS) await db.exec(part.sql); // second pass must not throw
    const r = await db.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'");
    assert.ok(r.rows[0].n >= REQUIRED_TABLES.length);
  } finally { await db.close(); }
});

test('the repair route is Admin-only and refuses without explicit confirmation', () => {
  const fn = readFileSync(new URL('frontend/functions/api/[[path]].js', root), 'utf8');
  const i = fn.indexOf("u.pathname==='/api/admin/schema/repair'");
  assert.ok(i > -1, 'repair route is missing');
  const route = fn.slice(i, i + 4000);
  assert.match(route, /Authentication required/);
  assert.match(route, /Admin role required/);
  assert.match(route, /apply-schema-repair/, 'must require an explicit confirmation token');
  assert.match(route, /applySchemaRepair/, 'route must delegate to the tested repair function');
  assert.match(route, /consumerateLimit|consumeRateLimit/i, 'must be rate limited');
  // The destructive-bundle guard lives in the repair module the route calls.
  const mod = readFileSync(new URL('frontend/functions/schema-repair.mjs', root), 'utf8');
  assert.match(mod, /destructiveStatements/, 'repair must refuse destructive bundles');
});

test('/api/ready reports what is missing and how to fix it, not just a count', () => {
  const fn = readFileSync(new URL('frontend/functions/api/[[path]].js', root), 'utf8');
  const i = fn.indexOf("/api/ready");
  const route = fn.slice(i, i + 1600);
  for (const field of ['missing', 'required', 'summary', 'howToFix']) {
    assert.ok(route.includes(field), `/api/ready does not expose ${field}`);
  }
  // The false claim we made earlier: sign-in is only affected if these are gone.
  assert.match(route, /signInAffected/);
});

test('the bundle is regenerated from the real migration files', () => {
  const script = readFileSync(new URL('scripts/build-schema-bundle.mjs', root), 'utf8');
  assert.match(script, /backend\/db\/migrations/, 'must read the same migrations the Node script runs');
  const pkg = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
  assert.equal(pkg.scripts['schema:bundle'], 'node scripts/build-schema-bundle.mjs');
});

test('the statement splitter respects quotes, comments and dollar-quoting', () => {
  // The Cloudflare query path is a prepared statement and rejects multiple
  // commands, so every file must be split correctly or the repair silently fails.
  assert.equal(splitSqlStatements('SELECT 1; SELECT 2;').length, 2);
  assert.equal(splitSqlStatements("CREATE TABLE a(x text DEFAULT 'a;b'); SELECT 1;").length, 2);
  assert.equal(splitSqlStatements('CREATE FUNCTION f() RETURNS int AS $$ SELECT 1; $$ LANGUAGE sql; SELECT 1;').length, 2);
  assert.equal(splitSqlStatements('-- a; b\nCREATE TABLE a(b int);').length, 1);
  assert.equal(splitSqlStatements('/* x; y */ CREATE TABLE a(b int);').length, 1);
  // Every bundled part must split into at least one statement and contain no
  // statement that is only a comment.
  for (const part of SCHEMA_PARTS) {
    const parts = splitSqlStatements(part.sql);
    assert.ok(parts.length > 0, `${part.name} produced no statements`);
    // A statement may be preceded by comments; it must still contain SQL.
    for (const st of parts) {
      const body = st.split('\n').filter(l => !l.trim().startsWith('--')).join('').trim();
      assert.ok(body.length > 0, `${part.name} has a comment-only statement`);
    }
  }
});

test('a real engine accepts every bundled statement individually', async () => {
  const db = await PGlite.create();
  try {
    for (const part of SCHEMA_PARTS) await runPart(db, part.sql);
    const r = await db.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'");
    assert.ok(r.rows[0].n >= REQUIRED_TABLES.length);
  } finally { await db.close(); }
});

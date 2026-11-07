import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { SCHEMA_PARTS, REQUIRED_TABLES, destructiveStatements } from '../../frontend/functions/schema-bundle.mjs';
import { applySchemaRepair, missingTables, unsafeStatements } from '../../frontend/functions/schema-repair.mjs';

const root = new URL('../../', import.meta.url);
const LIVE_HAS = ['app_users','sessions','records','audit_events','record_history','documents',
  'approvals','ai_runs','auth_rate_limits','assistant_tasks','assistant_notes',
  'platform_conversations','platform_messages'];

// An adapter shaped like the Cloudflare handler's: query(sql) -> rows array.
const adapter = db => ({
  query: async (sql, args) => (await db.query(sql, args)).rows
});

async function liveState() {
  const db = await PGlite.create();
  for (const p of SCHEMA_PARTS) await db.exec(p.sql);
  const missing = REQUIRED_TABLES.filter(t => !LIVE_HAS.includes(t));
  for (const t of missing) await db.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
  return { db, missing };
}

test('repairing a local fixture with the missing table names restores those names', async () => {
  const { db, missing } = await liveState();
  try {
    const before = await missingTables(adapter(db));
    assert.deepEqual(before.sort(), missing.sort(), 'fixture must model the reported missing table names');

    const result = await applySchemaRepair(adapter(db));
    assert.equal(result.ok, true, `still missing: ${result.missing.join(', ')}`);
    assert.equal(result.after, REQUIRED_TABLES.length);
    assert.equal(result.required, REQUIRED_TABLES.length);
    assert.deepEqual(result.missing, []);
    assert.deepEqual(result.failed, []);
    assert.equal(result.before, REQUIRED_TABLES.filter(t => !missing.includes(t)).length);
    // Sign-in tables were never touched, so sign-in keeps working.
    assert.equal(await missingTables(adapter(db)).then(m => m.includes('app_users')), false);
    assert.equal(await missingTables(adapter(db)).then(m => m.includes('sessions')), false);
  } finally { await db.close(); }
});

test('repairing a complete database changes nothing', async () => {
  const db = await PGlite.create();
  try {
    for (const p of SCHEMA_PARTS) await db.exec(p.sql);
    const result = await applySchemaRepair(adapter(db));
    assert.equal(result.ok, true);
    assert.equal(result.changed, false, 'a complete schema must not report a change');
    assert.deepEqual(result.missingBefore, []);
  } finally { await db.close(); }
});

test('the bundle does not match the limited blocked-statement patterns', () => {
  assert.deepEqual(unsafeStatements(), []);
  for (const p of SCHEMA_PARTS) assert.deepEqual(destructiveStatements(p.sql), []);
});

test('the HTTP route is Admin-only and needs explicit confirmation', () => {
  const fn = readFileSync(new URL('frontend/functions/api/[[path]].js', root), 'utf8');
  const i = fn.indexOf("u.pathname==='/api/admin/schema/repair'");
  assert.ok(i > -1);
  const route = fn.slice(i, i + 1600);
  assert.match(route, /Authentication required/);
  assert.match(route, /Admin role required/);
  assert.match(route, /apply-schema-repair/);
  assert.match(route, /consumeRateLimit/);
  assert.match(route, /applySchemaRepair/);
});

test('/api/ready reports the missing tables and the fix, and does not blame sign-in', () => {
  const fn = readFileSync(new URL('frontend/functions/api/[[path]].js', root), 'utf8');
  const i = fn.indexOf("u.pathname==='/api/ready'");
  const route = fn.slice(i, i + 1500);
  for (const f of ['missing', 'required', 'summary', 'howToFix', 'signInAffected']) {
    assert.ok(route.includes(f), `/api/ready omits ${f}`);
  }
});

test('a failed migration is never reported successful merely because tables exist', async () => {
  const { db } = await liveState();
  let failedOnce = false;
  const flaky = {
    query: async (sql, args) => {
      if (!failedOnce && /CREATE INDEX IF NOT EXISTS idx_records_region\s+ON records/i.test(sql)) {
        failedOnce = true;
        throw new Error('simulated index migration failure');
      }
      return (await db.query(sql, args)).rows;
    }
  };
  try {
    const result = await applySchemaRepair(flaky);
    assert.equal(failedOnce, true);
    assert.deepEqual(result.missing, [], 'all required tables were created by later parts');
    assert.equal(result.after, result.required);
    assert.equal(result.ok, false, 'partial migration must be reported as a failure');
    assert.ok(result.failed.some(failure => /simulated index migration failure/.test(failure.error)));
  } finally { await db.close(); }
});

test('table counts exclude unrelated tables', async () => {
  const db = await PGlite.create();
  try {
    for (const part of SCHEMA_PARTS) await db.exec(part.sql);
    await db.exec('CREATE TABLE unrelated_extra_table (id integer)');
    const result = await applySchemaRepair(adapter(db));
    assert.equal(result.before, REQUIRED_TABLES.length);
    assert.equal(result.after, REQUIRED_TABLES.length);
  } finally { await db.close(); }
});

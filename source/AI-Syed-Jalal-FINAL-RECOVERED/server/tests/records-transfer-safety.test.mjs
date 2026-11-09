import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { buildApi, root } from '../build.mjs';

// These tests use only disposable in-memory data. They never connect to the
// live database and do not imply that its backup or data is complete.
async function fixture() {
  const db = await PGlite.create();
  await db.exec(await readFile(resolve(root, 'backend/db/schema.sql'), 'utf8'));
  for (const file of (await readdir(resolve(root, 'backend/db/migrations'))).filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(await readFile(resolve(root, 'backend/db/migrations', file), 'utf8'));
  }
  await buildApi();
  const { onRequest } = await import('../../.data/api.mjs');
  const env = { DB_ADAPTER:{ query:async (sql, params=[]) => (await db.query(sql, params)).rows },
    LOCAL_PREVIEW:'true', COOKIE_SECURE:'false', CSRF_SECRET:'local-transfer-safety-secret-at-least-32-characters' };
  const client = (cookie='') => async (path, method='GET', body, token='') => {
    const response = await onRequest({ request:new Request(`https://preview.test/api${path}`, {
      method, headers:{ 'content-type':'application/json', 'cf-connecting-ip':'192.0.2.164',
        ...(cookie ? { cookie } : {}), ...(token ? { 'x-csrf-token':token } : {}) },
      ...(body === undefined ? {} : { body:JSON.stringify(body) })
    }), env });
    return { status:response.status, data:await response.json(), cookie:response.headers.get('set-cookie')?.split(';')[0] || '' };
  };
  const anonymous = client(), demo = await anonymous('/demo', 'POST', {});
  assert.equal(demo.status, 200);
  const admin = client(demo.cookie), token = (await admin('/me')).data.csrfToken;
  const makeAccount = async (name, role) => {
    const password = 'Local-Test-Password123';
    assert.equal((await admin('/admin/users', 'POST', { username:name, password, role }, token)).status, 201);
    const login = await anonymous('/auth/login', 'POST', { username:name, password });
    assert.equal(login.status, 200);
    const user = client(login.cookie);
    return { user, token:(await user('/me')).data.csrfToken };
  };
  return { db, admin, anonymous, token, makeAccount };
}

test('bulk import validates the whole batch and cannot revive a deleted record', async () => {
  const { db, admin, anonymous, token, makeAccount } = await fixture();
  try {
    const active = { id:'LOCAL-A', name:'Active original', notes:'preserved until update' };
    const deleted = { id:'LOCAL-D', name:'Deleted original', notes:'do not resurrect' };
    for (const row of [active, deleted]) assert.equal((await admin('/records', 'POST', row, token)).status, 201);
    assert.equal((await admin('/records/LOCAL-D', 'DELETE', {}, token)).status, 200);
    const beforeDeleted = (await db.query("SELECT id,name,notes,deleted_at,deleted_by FROM records WHERE id='LOCAL-D'")).rows[0];
    const { user:operator, token:operatorToken } = await makeAccount('local-transfer-operator', 'Data Operator');
    const { user:viewer, token:viewerToken } = await makeAccount('local-transfer-viewer', 'Viewer');
    const payload = { records:[
      { id:'LOCAL-A', name:'Updated active', notes:'line 1\nline 2' },
      { id:'LOCAL-D', name:'Must not revive' },
      { id:'LOCAL-N', name:'New local record' }
    ] };
    assert.equal((await anonymous('/records/bulk', 'POST', payload)).status, 401);
    assert.equal((await viewer('/records/bulk', 'POST', payload, viewerToken)).status, 403);
    assert.equal((await operator('/records/bulk', 'POST', payload)).status, 403);
    const result = await operator('/records/bulk', 'POST', payload, operatorToken);
    assert.equal(result.status, 200);
    assert.deepEqual(result.data, { inserted:1, updated:1, skipped:1, skippedDeleted:1 });
    assert.deepEqual((await db.query("SELECT id,name,notes,deleted_at,deleted_by FROM records WHERE id='LOCAL-D'")).rows[0], beforeDeleted);
    assert.equal((await db.query("SELECT notes FROM records WHERE id='LOCAL-A'")).rows[0].notes, 'line 1\nline 2');
    assert.equal((await operator('/records/LOCAL-D')).status, 404);

    const before = (await db.query('SELECT id,name,notes,deleted_at FROM records ORDER BY id')).rows;
    for (const records of [
      [{ id:'LOCAL-X', name:'Would be new' }, { id:'LOCAL-X', name:'Duplicate' }],
      [{ id:'LOCAL-X', name:'Would be new' }, { id:'LOCAL-Y', name:'Too long', notes:'x'.repeat(10001) }],
      [{ id:'LOCAL-X', name:'Would be new' }, { id:'LOCAL-Y', name:'' }]
    ]) {
      const bad = await operator('/records/bulk', 'POST', { records }, operatorToken);
      assert.equal(bad.status, 400);
      assert.deepEqual((await db.query('SELECT id,name,notes,deleted_at FROM records ORDER BY id')).rows, before);
    }
  } finally { await db.close(); }
});

test('records with identical update timestamps use a stable ID tiebreaker across pages', async () => {
  const { db, admin, token } = await fixture();
  try {
    const rows=Array.from({length:220},(_,i)=>({id:'PAGE-'+String(i).padStart(4,'0'),name:'Local page '+i}));
    assert.equal((await admin('/records/bulk','POST',{records:rows},token)).status,200);
    const first=await admin('/records?page=1&limit=200'),second=await admin('/records?page=2&limit=200');
    assert.equal(first.status,200);assert.equal(second.status,200);
    const ids=[...first.data.records,...second.data.records].map(row=>row.id);
    assert.deepEqual(ids,rows.map(row=>row.id));
    assert.equal(new Set(ids).size,220);
  } finally { await db.close(); }
});

test('record merge skips deleted records unless an Admin explicitly opts in', async () => {
  const { db, admin, token, makeAccount } = await fixture();
  try {
    for (const row of [{ id:'MERGE-A', name:'Current' }, { id:'MERGE-D', name:'Deleted' }]) {
      assert.equal((await admin('/records', 'POST', row, token)).status, 201);
    }
    assert.equal((await admin('/records/MERGE-D', 'DELETE', {}, token)).status, 200);
    const beforeDeleted = (await db.query("SELECT name,deleted_at,deleted_by FROM records WHERE id='MERGE-D'")).rows[0];
    const base = { format:'alsyed-jalal-backup', version:1, records:[
      { id:'MERGE-A', name:'Backup active' }, { id:'MERGE-D', name:'Backup deleted' }, { id:'MERGE-N', name:'New from export' }
    ] };
    const { user:operator, token:operatorToken } = await makeAccount('local-restore-operator', 'Data Operator');
    assert.equal((await operator('/restore', 'POST', base, operatorToken)).status, 403);
    assert.equal((await admin('/restore', 'POST', base)).status, 403);
    assert.equal((await admin('/restore', 'POST', { ...base, restoreDeleted:true }, token)).status, 400);
    assert.equal((await admin('/restore', 'POST', { ...base, version:2 }, token)).status, 400);
    const merged = await admin('/restore', 'POST', base, token);
    assert.equal(merged.status, 200);
    assert.deepEqual(merged.data, { ok:true, restoredRecords:2, skippedDeleted:1, restoreDeleted:false, mode:'merge' });
    assert.deepEqual((await db.query("SELECT name,deleted_at,deleted_by FROM records WHERE id='MERGE-D'")).rows[0], beforeDeleted);
    assert.equal((await db.query("SELECT name FROM records WHERE id='MERGE-A'")).rows[0].name, 'Backup active');
    const duplicate = await admin('/restore', 'POST', { ...base, records:[base.records[0], base.records[0]] }, token);
    assert.equal(duplicate.status, 400);
    const restored = await admin('/restore', 'POST', { ...base, restoreDeleted:true, confirm:'restore-deleted-records' }, token);
    assert.equal(restored.status, 200);
    assert.equal(restored.data.restoredRecords, 3);
    assert.equal(restored.data.skippedDeleted, 0);
    assert.equal(restored.data.restoreDeleted, true);
    assert.deepEqual((await db.query("SELECT name,deleted_at,deleted_by FROM records WHERE id='MERGE-D'")).rows[0],
      { name:'Backup deleted', deleted_at:null, deleted_by:null });
  } finally { await db.close(); }
});

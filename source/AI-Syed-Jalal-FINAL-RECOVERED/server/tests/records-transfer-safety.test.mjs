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

test('individual record writes validate all supplied values without silent truncation', async () => {
  const { db, admin, token } = await fixture();
  try {
    for (const row of [
      { id:'BAD-A', name:' ' },
      { id:'BAD-B', name:'Valid', region:'x'.repeat(201) },
      { id:'BAD-C', name:'Valid', notes:'x'.repeat(10001) },
      { id:'BAD-D', name:'Valid', sector:{ nested:'invalid' } },
      { id:'x'.repeat(201), name:'Valid' }
    ]) assert.equal((await admin('/records', 'POST', row, token)).status, 400);
    assert.equal((await db.query('SELECT count(*)::int AS n FROM records')).rows[0].n, 0);

    const original = { id:'ONE', name:'  Preserve name  ', region:'  North  ', sector:'', status:'', notes:'\nFirst\nLast  ' };
    const created = await admin('/records','POST',original,token);
    assert.equal(created.status,201);assert.deepEqual(created.data.record,original);
    assert.deepEqual((await db.query("SELECT id,name,region,sector,status,notes FROM records WHERE id='ONE'")).rows[0],original);
    const before = (await db.query("SELECT id,name,region,sector,status,notes FROM records WHERE id='ONE'")).rows[0];
    for (const patch of [{ name:' ' }, { region:'x'.repeat(201) }, { notes:'x'.repeat(10001) }]) {
      assert.equal((await admin('/records/ONE','PUT',patch,token)).status,400);
      assert.deepEqual((await db.query("SELECT id,name,region,sector,status,notes FROM records WHERE id='ONE'")).rows[0],before);
    }
    const updated=await admin('/records/ONE','PUT',{notes:'  Updated\nline  ',name:null},token);
    assert.equal(updated.status,200);assert.equal(updated.data.record.name,original.name);
    assert.equal(updated.data.record.notes,'  Updated\nline  ');assert.equal(updated.data.record.status,'');
    assert.equal((await admin('/records/ONE','DELETE',{},token)).status,200);
    const history=(await db.query("SELECT action,snapshot FROM record_history WHERE record_id='ONE' ORDER BY created_at,id")).rows;
    assert.equal(history.length,3);assert.deepEqual(new Set(history.map(row=>row.action)),new Set(['CREATE','UPDATE','SOFT_DELETE']));
    assert.equal(history.find(row=>row.action==='CREATE').snapshot.notes,original.notes);
  } finally { await db.close(); }
});

test('individual create returns stored fields when a BEFORE trigger changes a value', async () => {
  const { db, admin, token } = await fixture();
  try {
    await db.exec(`CREATE FUNCTION local_record_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN NEW.region := 'Changed by trigger'; RETURN NEW; END $$;
      CREATE TRIGGER local_record_trigger BEFORE INSERT ON records FOR EACH ROW EXECUTE FUNCTION local_record_trigger();`);
    const created=await admin('/records','POST',{id:'TRIGGER',name:'Example',region:'Submitted'},token);
    assert.equal(created.status,201);
    assert.equal(created.data.record.region,'Changed by trigger');
    const saved=(await db.query("SELECT region FROM records WHERE id='TRIGGER'")).rows[0];
    assert.equal(saved.region,created.data.record.region);
    const history=(await db.query("SELECT snapshot FROM record_history WHERE record_id='TRIGGER'")).rows[0];
    assert.equal(history.snapshot.region,created.data.record.region);
  } finally { await db.close(); }
});

test('versioned individual edits reject stale versions without mutating records or history', async () => {
  const { db, admin, token } = await fixture();
  try {
    assert.equal((await admin('/records','POST',{id:'VERSIONED',name:'Original',notes:'First'},token)).status,201);
    const first=await admin('/records/VERSIONED');
    assert.equal(first.status,200);assert.match(first.data.record.version,/^\d+$/);
    const initialVersion=first.data.record.version;
    // An older client without the optional version remains supported.
    assert.equal((await admin('/records/VERSIONED','PUT',{notes:'Concurrent'},token)).status,200);
    const before=(await db.query("SELECT id,name,notes,updated_at FROM records WHERE id='VERSIONED'")).rows[0];
    const historyBefore=(await db.query("SELECT count(*)::int AS n FROM record_history WHERE record_id='VERSIONED'")).rows[0].n;
    const stale=await admin('/records/VERSIONED','PUT',{name:'Must not overwrite',expectedVersion:initialVersion},token);
    assert.equal(stale.status,409);assert.equal(stale.data.code,'RECORD_CONFLICT');
    assert.deepEqual((await db.query("SELECT id,name,notes,updated_at FROM records WHERE id='VERSIONED'")).rows[0],before);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM record_history WHERE record_id='VERSIONED'")).rows[0].n,historyBefore);
    for(const expectedVersion of [null,123,'','invalid','1'.repeat(21)]) {
      assert.equal((await admin('/records/VERSIONED','PUT',{name:'Invalid',expectedVersion},token)).status,400);
    }
    const current=(await admin('/records/VERSIONED')).data.record;
    assert.notEqual(current.version,initialVersion);
    assert.equal((await admin('/records/VERSIONED','PUT',{name:'Reviewed',expectedVersion:current.version},token)).status,200);
    assert.deepEqual((await db.query("SELECT name,notes FROM records WHERE id='VERSIONED'")).rows[0],{name:'Reviewed',notes:'Concurrent'});
    assert.equal((await admin('/records/DOES-NOT-EXIST','PUT',{name:'Missing',expectedVersion:current.version},token)).status,404);
    const shared=(await admin('/records/VERSIONED')).data.record.version;
    const attempts=await Promise.all(['First writer','Second writer'].map(name=>admin('/records/VERSIONED','PUT',{name,expectedVersion:shared},token)));
    assert.deepEqual(attempts.map(result=>result.status).sort(),[200,409]);
    assert.ok(['First writer','Second writer'].includes((await admin('/records/VERSIONED')).data.record.name));
  } finally { await db.close(); }
});

test('individual writes roll back when the history table is unavailable', async () => {
  const { db, admin, token } = await fixture();
  try {
    assert.equal((await admin('/records','POST',{id:'ORIGINAL',name:'Untouched'},token)).status,201);
    const before=(await db.query("SELECT id,name,notes,updated_at,deleted_at,deleted_by FROM records WHERE id='ORIGINAL'")).rows[0];
    await db.exec('ALTER TABLE record_history RENAME TO local_history_unavailable');
    for (const [path,method,body] of [
      ['/records','POST',{id:'NOT-CREATED',name:'New'}],
      ['/records/ORIGINAL','PUT',{name:'Must not update'}],
      ['/records/ORIGINAL','DELETE',{}]
    ]) assert.equal((await admin(path,method,body,token)).status,500);
    assert.deepEqual((await db.query("SELECT id,name,notes,updated_at,deleted_at,deleted_by FROM records WHERE id='ORIGINAL'")).rows[0],before);
    assert.equal((await db.query("SELECT count(*)::int AS n FROM records WHERE id='NOT-CREATED'")).rows[0].n,0);
    await db.exec('ALTER TABLE local_history_unavailable RENAME TO record_history');
    assert.equal((await db.query("SELECT count(*)::int AS n FROM record_history WHERE record_id='ORIGINAL'")).rows[0].n,1);
  } finally { await db.close(); }
});

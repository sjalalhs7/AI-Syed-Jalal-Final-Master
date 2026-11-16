import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { buildApi } from '../build.mjs';
import { SCHEMA_PARTS } from '../../frontend/functions/schema-bundle.mjs';

// This opt-in test is for a DISPOSABLE local PostgreSQL service only. It creates
// and drops a randomly named schema, and never accepts a remote host or another
// database name. It must not be pointed at a forwarded production connection.
const connectionString = process.env.AJ_PASSWORD_PG_TEST_URL || '';
if (!connectionString) {
  if (process.env.AJ_PASSWORD_PG_TEST_REQUIRED === 'true') throw new Error('AJ_PASSWORD_PG_TEST_URL is required for this PostgreSQL test run.');
  test.skip('real PostgreSQL password/session lock tests need the isolated local test service', () => {});
} else {
  const connection = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(connection.protocol) || connection.hostname !== '127.0.0.1' || connection.username !== 'aj_password_test' || connection.pathname !== '/aj_password_race_test' || connection.search || connection.hash) {
    throw new Error('AJ_PASSWORD_PG_TEST_URL must name the disposable local aj_password_race_test database and aj_password_test user without URL options.');
  }
  const schema = 'aj_password_test_' + crypto.randomUUID().replaceAll('-', '');
  const oldPassword = 'Synthetic-postgres-old-password-123';
  const newPassword = 'Synthetic-postgres-new-password-456';
  let admin, pool, onRequest, schemaCreated = false;
  const query = async (sql, params = []) => (await pool.query(sql, params)).rows;
  async function batch(build, options = {}, hooks = {}) {
    assert.equal(options.isolationLevel, 'ReadCommitted');
    const commands = build({ query: (text, params = []) => ({ text, params }) });
    const client = await pool.connect();
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      const result = [];
      for (let i = 0; i < commands.length; i++) {
        if (i === 0) hooks.beforeFirst?.(client.processID);
        result.push((await client.query(commands[i].text, commands[i].params)).rows);
        if (i === 0 && hooks.afterFirst) await hooks.afterFirst();
      }
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  const adapter = { query, transaction: (build, options) => batch(build, options) };
  const env = { DB_ADAPTER: adapter, LOCAL_PREVIEW: 'true', COOKIE_SECURE: 'false', CSRF_SECRET: 'isolated-postgres-password-race-secret-over-32-characters' };

  before(async () => {
    admin = new pg.Pool({ connectionString, max: 2 });
    const database = await admin.query('SELECT current_database() AS name, current_user AS username, inet_server_addr()::text AS address');
    assert.equal(database.rows[0].name, 'aj_password_race_test');
    assert.equal(database.rows[0].username, 'aj_password_test');
    const address = String(database.rows[0].address || '').split('/')[0];
    const parts = address.split('.').map(Number);
    const privateContainer = parts.length === 4 && parts.every(n => Number.isInteger(n) && n >= 0 && n <= 255) &&
      (parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168));
    assert.ok(address === '127.0.0.1' || (process.env.AJ_PASSWORD_PG_TEST_CONTAINER === 'true' && privateContainer), 'PostgreSQL must be local or an explicitly enabled private test container');
    await admin.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    pool = new pg.Pool({ connectionString, max: 8, options: `-c search_path=${schema}` });
    for (const part of SCHEMA_PARTS) await pool.query(part.sql);
    await buildApi();
    ({ onRequest } = await import('../../.data/api.mjs'));
  });
  beforeEach(async () => { await pool.query('TRUNCATE sessions, audit_events, auth_rate_limits, app_users CASCADE'); });
  after(async () => {
    await pool?.end();
    try { if (admin && schemaCreated) await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); }
    finally { await admin?.end(); }
  });

  async function request(path, { method = 'GET', body, cookie, csrf, dbAdapter = adapter, override = {} } = {}) {
    const headers = { 'content-type': 'application/json', 'cf-connecting-ip': '192.0.2.97' };
    if (cookie) headers.cookie = cookie.split(';')[0];
    if (csrf) headers['x-csrf-token'] = csrf;
    const response = await onRequest({
      request: new Request('https://isolated.test/api' + path, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
      env: { ...env, ...override, DB_ADAPTER: dbAdapter }
    });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') };
  }
  async function account(username) {
    const created = await request('/auth/register', { method: 'POST', body: { username, password: oldPassword } });
    assert.equal(created.status, 201);
    const me = await request('/me', { cookie: created.cookie });
    return { cookie: created.cookie, csrf: me.data.csrfToken };
  }
  const login = (username, dbAdapter) => request('/auth/login', { method: 'POST', body: { username, password: oldPassword }, dbAdapter });
  const change = (session, dbAdapter, next = newPassword) => request('/auth/change-password', {
    method: 'POST', cookie: session.cookie, csrf: session.csrf, body: { currentPassword: oldPassword, newPassword: next }, dbAdapter
  });
  async function blocked(pid) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const rows = await query('SELECT cardinality(pg_blocking_pids($1::int)) AS count', [pid]);
      if (Number(rows[0].count) > 0) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error('Expected a PostgreSQL row-lock wait.');
  }
  function deadline(promise) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Race setup timed out.')), 10000); })]).finally(() => clearTimeout(timer));
  }

  test('a session committed while password change waits is included in revocation', { timeout: 30000 }, async () => {
    const first = await account('pg-login-first');
    let inserted, allowLogin, changePid;
    const insertion = new Promise(resolve => { inserted = resolve; });
    const loginGate = new Promise(resolve => { allowLogin = resolve; });
    const changeStarted = new Promise(resolve => { changePid = resolve; });
    const heldLogin = { query: async (sql, params = []) => {
      if (!sql.includes('WITH verified_user AS')) return query(sql, params);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(sql, params);
        inserted(); await loginGate;
        await client.query('COMMIT');
        return result.rows;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    } };
    const monitoredChange = { query, transaction: (build, options) => batch(build, options, { beforeFirst: changePid }) };
    const loginPending = login('pg-login-first', heldLogin);
    let changePending;
    try {
      await deadline(insertion);
      changePending = change(first, monitoredChange);
      await blocked(await deadline(changeStarted));
      allowLogin();
      const [other, changed] = await Promise.all([loginPending, changePending]);
      assert.equal(other.status, 200); assert.equal(changed.status, 200);
      assert.equal((await request('/me', { cookie: other.cookie })).data.authenticated, false);
      assert.equal((await request('/me', { cookie: first.cookie })).data.authenticated, true);
    } finally {
      allowLogin();
      await Promise.allSettled([loginPending, ...(changePending ? [changePending] : [])]);
    }
  });

  test('a stale login waiting for the account lock cannot create a session', { timeout: 30000 }, async () => {
    const first = await account('pg-change-first');
    let updated, allowChange, loginPid;
    const update = new Promise(resolve => { updated = resolve; });
    const changeGate = new Promise(resolve => { allowChange = resolve; });
    const loginStarted = new Promise(resolve => { loginPid = resolve; });
    const heldChange = { query, transaction: (build, options) => batch(build, options, { afterFirst: async () => { updated(); await changeGate; } }) };
    const monitoredLogin = { query: async (sql, params = []) => {
      if (!sql.includes('WITH verified_user AS')) return query(sql, params);
      const client = await pool.connect();
      try {
        const result = client.query(sql, params);
        loginPid(client.processID);
        return (await result).rows;
      } finally { client.release(); }
    } };
    const changePending = change(first, heldChange);
    let loginPending;
    try {
      await deadline(update);
      loginPending = login('pg-change-first', monitoredLogin);
      await blocked(await deadline(loginStarted));
      allowChange();
      const [changed, stale] = await Promise.all([changePending, loginPending]);
      assert.equal(changed.status, 200); assert.equal(stale.status, 401);
      assert.equal(stale.data.code, 'AUTH_CREDENTIALS_CHANGED'); assert.equal(stale.cookie, null);
      assert.equal((await request('/me', { cookie: first.cookie })).data.authenticated, true);
    } finally {
      allowChange();
      await Promise.allSettled([changePending, ...(loginPending ? [loginPending] : [])]);
    }
  });

  test('a setup promotion that commits first has its new session revoked by a waiting password change', { timeout: 30000 }, async () => {
    const username = 'pg-setup-first', first = await account(username);
    const setupEnv = { FIRST_ADMIN_SETUP_ENABLED: 'true', SEED_ADMIN_USERNAME: username, SEED_ADMIN_PASSWORD: oldPassword };
    let promoted, allowSetup, changePid;
    const promotion = new Promise(resolve => { promoted = resolve; });
    const setupGate = new Promise(resolve => { allowSetup = resolve; });
    const changeStarted = new Promise(resolve => { changePid = resolve; });
    const heldSetup = { query: async (sql, params = []) => {
      if (!sql.includes('WITH promoted_user AS')) return query(sql, params);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query(sql, params);
        promoted(); await setupGate;
        await client.query('COMMIT'); return result.rows;
      } catch (error) { await client.query('ROLLBACK'); throw error; }
      finally { client.release(); }
    } };
    const monitoredChange = { query, transaction: (build, options) => batch(build, options, { beforeFirst: changePid }) };
    const claim = request('/bootstrap/admin', { method: 'POST', body: { username, password: oldPassword }, override: setupEnv, dbAdapter: heldSetup });
    let changing;
    try {
      await deadline(promotion);
      changing = change(first, monitoredChange);
      await blocked(await deadline(changeStarted));
      allowSetup();
      const [claimed, changed] = await Promise.all([claim, changing]);
      assert.equal(claimed.status, 201); assert.equal(changed.status, 200);
      assert.equal((await request('/me', { cookie: claimed.cookie })).data.authenticated, false);
      const kept = await request('/me', { cookie: first.cookie });
      assert.equal(kept.data.authenticated, true); assert.equal(kept.data.user.role, 'Admin');
    } finally {
      allowSetup();
      await Promise.allSettled([claim, ...(changing ? [changing] : [])]);
    }
  });

  test('a setup promotion waiting for a password change cannot issue a stale Admin session', { timeout: 30000 }, async () => {
    const username = 'pg-setup-second', first = await account(username);
    const setupEnv = { FIRST_ADMIN_SETUP_ENABLED: 'true', SEED_ADMIN_USERNAME: username, SEED_ADMIN_PASSWORD: oldPassword };
    let updated, allowChange, setupPid;
    const update = new Promise(resolve => { updated = resolve; });
    const changeGate = new Promise(resolve => { allowChange = resolve; });
    const setupStarted = new Promise(resolve => { setupPid = resolve; });
    const heldChange = { query, transaction: (build, options) => batch(build, options, { afterFirst: async () => { updated(); await changeGate; } }) };
    const monitoredSetup = { query: async (sql, params = []) => {
      if (!sql.includes('WITH promoted_user AS')) return query(sql, params);
      const client = await pool.connect();
      try { const result = client.query(sql, params); setupPid(client.processID); return (await result).rows; }
      finally { client.release(); }
    } };
    const changing = change(first, heldChange);
    let claim;
    try {
      await deadline(update);
      claim = request('/bootstrap/admin', { method: 'POST', body: { username, password: oldPassword }, override: setupEnv, dbAdapter: monitoredSetup });
      await blocked(await deadline(setupStarted));
      allowChange();
      const [changed, stale] = await Promise.all([changing, claim]);
      assert.equal(changed.status, 200); assert.equal(stale.status, 409); assert.equal(stale.cookie, null);
      const kept = await request('/me', { cookie: first.cookie });
      assert.equal(kept.data.authenticated, true); assert.equal(kept.data.user.role, 'Viewer');
    } finally {
      allowChange();
      await Promise.allSettled([changing, ...(claim ? [claim] : [])]);
    }
  });

  test('seed recovery revokes prior sessions and blocks a concurrent stale login', { timeout: 30000 }, async () => {
    const first = await account('pg-seed-owner');
    await pool.query("UPDATE app_users SET role='Admin' WHERE username='pg-seed-owner'");
    const seedPassword = 'Synthetic-seed-recovery-password-456';
    const recoveryEnv = { SEED_ADMIN_USERNAME: 'pg-seed-owner', SEED_ADMIN_PASSWORD: seedPassword };
    let updated, allowRecovery, loginPid;
    const update = new Promise(resolve => { updated = resolve; });
    const recoveryGate = new Promise(resolve => { allowRecovery = resolve; });
    const loginStarted = new Promise(resolve => { loginPid = resolve; });
    const heldRecovery = { query, transaction: (build, options) => batch(build, options, { afterFirst: async () => { updated(); await recoveryGate; } }) };
    const monitoredLogin = { query: async (sql, params = []) => {
      if (!sql.includes('WITH verified_user AS')) return query(sql, params);
      const client = await pool.connect();
      try { const result = client.query(sql, params); loginPid(client.processID); return (await result).rows; }
      finally { client.release(); }
    } };
    const recovering = request('/auth/login', { method: 'POST', body: { username: 'pg-seed-owner', password: seedPassword }, override: recoveryEnv, dbAdapter: heldRecovery });
    let staleLogin;
    try {
      await deadline(update);
      staleLogin = login('pg-seed-owner', monitoredLogin);
      await blocked(await deadline(loginStarted));
      allowRecovery();
      const [recovered, stale] = await Promise.all([recovering, staleLogin]);
      assert.equal(recovered.status, 200); assert.equal(recovered.data.seedRecovery, true);
      assert.equal(stale.status, 401); assert.equal(stale.data.code, 'AUTH_CREDENTIALS_CHANGED');
      assert.equal((await request('/me', { cookie: first.cookie })).data.authenticated, false);
      assert.equal((await request('/me', { cookie: recovered.cookie })).data.authenticated, true);
      assert.equal((await request('/auth/login', { method: 'POST', body: { username: 'pg-seed-owner', password: seedPassword } })).status, 200);
    } finally {
      allowRecovery();
      await Promise.allSettled([recovering, ...(staleLogin ? [staleLogin] : [])]);
    }
  });

  test('a session revoked before the credential write cannot change the password', { timeout: 30000 }, async () => {
    const first = await account('pg-revoked-session');
    const second = await login('pg-revoked-session');
    assert.equal(second.status, 200);
    const secondMe = await request('/me', { cookie: second.cookie });
    const secondSession = { cookie: second.cookie, csrf: secondMe.data.csrfToken };
    let reachedRead, resume;
    const reached = new Promise(resolve => { reachedRead = resolve; });
    const gate = new Promise(resolve => { resume = resolve; });
    const paused = { query: async (sql, params = []) => {
      const rows = await query(sql, params);
      if (sql.startsWith('SELECT salt,password_hash FROM app_users WHERE id=$1 AND active=true')) {
        reachedRead(); await gate;
      }
      return rows;
    }, transaction: adapter.transaction };
    const changing = change(secondSession, paused);
    try {
      await deadline(reached);
      const revoked = await request('/auth/sessions', { method: 'DELETE', cookie: first.cookie, csrf: first.csrf });
      assert.equal(revoked.status, 200);
    } finally { resume(); }
    const result = await changing;
    assert.equal(result.status, 409); assert.equal(result.data.code, 'PASSWORD_CHANGE_STALE');
    assert.equal((await request('/me', { cookie: first.cookie })).data.authenticated, true);
    assert.equal((await request('/me', { cookie: second.cookie })).data.authenticated, false);
    assert.equal((await login('pg-revoked-session')).status, 200);
    assert.equal((await request('/auth/login', { method: 'POST', body: { username: 'pg-revoked-session', password: newPassword } })).status, 401);
  });

  test('concurrent changes that verified the same old password have one winner', { timeout: 30000 }, async () => {
    const first = await account('pg-change-race');
    let arrivals = 0, release;
    const gate = new Promise(resolve => { release = resolve; });
    const racing = { query: async (sql, params = []) => {
      const rows = await query(sql, params);
      if (sql.startsWith('SELECT salt,password_hash FROM app_users WHERE id=$1 AND active=true') && arrivals < 2) {
        arrivals++;
        if (arrivals === 2) release();
        await deadline(gate);
      }
      return rows;
    }, transaction: adapter.transaction };
    const [a, b] = await Promise.all([
      change(first, racing, 'Synthetic-new-one-456'),
      change(first, racing, 'Synthetic-new-two-789')
    ]);
    assert.equal(arrivals, 2);
    assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    assert.equal((a.status === 409 ? a : b).data.code, 'PASSWORD_CHANGE_STALE');
  });
}

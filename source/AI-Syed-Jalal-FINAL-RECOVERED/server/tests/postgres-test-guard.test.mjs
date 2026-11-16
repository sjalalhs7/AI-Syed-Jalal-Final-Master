import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// These URLs are rejected before any connection is attempted. Port 1 and the
// synthetic password are intentional; never use a real connection string here.
const raceTest = fileURLToPath(new URL('./postgres-password-concurrency.test.mjs', import.meta.url));
const invalid = [
  ['remote hostname', 'postgresql://aj_password_test:fixture@example.invalid:1/aj_password_race_test'],
  ['localhost hostname', 'postgresql://aj_password_test:fixture@localhost:1/aj_password_race_test'],
  ['wrong user', 'postgresql://other_user:fixture@127.0.0.1:1/aj_password_race_test'],
  ['wrong database', 'postgresql://aj_password_test:fixture@127.0.0.1:1/other_database'],
  ['URL options', 'postgresql://aj_password_test:fixture@127.0.0.1:1/aj_password_race_test?sslmode=require'],
  ['URL fragment', 'postgresql://aj_password_test:fixture@127.0.0.1:1/aj_password_race_test#fragment']
];

test('a required PostgreSQL run fails instead of silently skipping without its URL', () => {
  const env = { ...process.env, AJ_PASSWORD_PG_TEST_REQUIRED: 'true' };
  delete env.DATABASE_URL;
  delete env.AJ_PASSWORD_PG_TEST_URL;
  delete env.AJ_PASSWORD_PG_TEST_CONTAINER;
  delete env.NODE_TEST_CONTEXT;
  const child = spawnSync(process.execPath, [raceTest], { env, encoding: 'utf8', timeout: 15000 });
  assert.equal(child.error, undefined);
  assert.notEqual(child.status, 0);
  assert.match(child.stdout + child.stderr, /AJ_PASSWORD_PG_TEST_URL is required/);
});

for (const [name, url] of invalid) {
  test(`PostgreSQL race fixture rejects ${name} before connecting`, () => {
    const env = { ...process.env, AJ_PASSWORD_PG_TEST_URL: url };
    delete env.DATABASE_URL;
    delete env.AJ_PASSWORD_PG_TEST_CONTAINER;
    delete env.AJ_PASSWORD_PG_TEST_REQUIRED;
    delete env.NODE_TEST_CONTEXT;
    const child = spawnSync(process.execPath, [raceTest], { env, encoding: 'utf8', timeout: 15000 });
    assert.equal(child.error, undefined);
    assert.notEqual(child.status, 0);
    assert.match(child.stdout + child.stderr, /AJ_PASSWORD_PG_TEST_URL must name the disposable local/);
  });
}

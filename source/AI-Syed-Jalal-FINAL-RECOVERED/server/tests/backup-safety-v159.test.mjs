import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, statSync, existsSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

// These shell tests use fake pg_dump / pg_restore executables and disposable
// temporary directories. They never connect to or restore a database.
const app = fileURLToPath(new URL('../../', import.meta.url));
const script = name => join(app, 'scripts', name);
const shell = process.platform === 'win32' ? { skip: 'requires Bash and Unix permissions' } : {};
const dummyUrl = 'postgresql://dummy-user:dummy-secret@invalid.example/dummy';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'aj-backup-safety-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const bin = join(dir, 'bin'), output = join(dir, 'output'), calls = join(dir, 'calls');
  mkdirSync(bin); mkdirSync(output);
  writeFileSync(join(bin, 'pg_dump'), `#!/usr/bin/env bash
printf 'pg_dump:' >> "$FAKE_CALLS"; printf ' <%s>' "$@" >> "$FAKE_CALLS"
printf '\\nurl=%s\\nservice=%s\\n' "\${DATABASE_URL-unset}" "\${PGSERVICE-unset}" >> "$FAKE_CALLS"
printf 'fake archive bytes'
if [[ "\${FAKE_DUMP_FAIL:-}" == 1 ]]; then exit 23; fi
`, { mode: 0o755 });
  writeFileSync(join(bin, 'pg_restore'), `#!/usr/bin/env bash
printf 'pg_restore:' >> "$FAKE_CALLS"; printf ' <%s>' "$@" >> "$FAKE_CALLS"; printf '\\n' >> "$FAKE_CALLS"
if [[ "\${FAKE_LIST_FAIL:-}" == 1 ]]; then exit 24; fi
`, { mode: 0o755 });
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, PGSERVICE: 'test-backup-service', DATABASE_URL: dummyUrl, FAKE_CALLS: calls };
  const run = (name, args = [], extraEnv = {}) => spawnSync('bash', [script(name), ...args], { cwd: dir, env: { ...env, ...extraEnv }, encoding: 'utf8' });
  return { dir, output, calls, run, log: () => existsSync(calls) ? readFileSync(calls, 'utf8') : '' };
}

test('legacy destructive restore is disabled before any database tool can run', shell, t => {
  const f = fixture(t);
  const result = f.run('restore.sh', ['some-archive.dump']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /disabled/i);
  assert.match(result.stderr, /--clean|destructive/i);
  assert.match(result.stderr, /no database/i);
  assert.doesNotMatch(result.stderr + result.stdout, /dummy-secret/);
  assert.equal(f.log(), '');
});

test('backup requires an explicit service and a directory outside the repository', shell, t => {
  const f = fixture(t);
  for (const [args, env] of [[[], {}], [[f.output], { PGSERVICE: '' }], [[app], {}], [[resolve(app, '../..')], {}]]) {
    const result = f.run('backup.sh', args, env);
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stderr + result.stdout, /dummy-secret/);
    assert.equal(f.log(), '', 'preflight must fail before pg_dump');
  }
  const alias = join(f.dir, 'repository-alias');
  symlinkSync(app, alias, 'dir');
  assert.notEqual(f.run('backup.sh', [alias]).status, 0, 'a symlink into the repository is not an external directory');
  assert.equal(f.log(), '');
});

test('backup writes a private unique one-database archive, never puts the URL in argv, and does not claim a restore', shell, t => {
  const f = fixture(t);
  for (let i = 0; i < 2; i++) {
    const result = f.run('backup.sh', [f.output]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /not.*restore|no restore/i);
    assert.match(result.stdout, /one database|single database/i);
    assert.match(result.stdout, /not encrypted/i);
    assert.doesNotMatch(result.stdout + result.stderr, /dummy-secret/);
  }
  const entries = readdirSync(f.output);
  assert.equal(entries.length, 2, 'repeated runs cannot overwrite each other');
  for (const name of entries) {
    const folder = join(f.output, name), archive = join(folder, 'database.dump');
    assert.equal(statSync(folder).mode & 0o777, 0o700);
    assert.equal(statSync(archive).mode & 0o777, 0o600);
    assert.equal(readFileSync(archive, 'utf8'), 'fake archive bytes');
  }
  const calls = f.log();
  assert.equal((calls.match(/pg_dump:/g) || []).length, 2);
  assert.equal((calls.match(/pg_restore: <--list>/g) || []).length, 2);
  assert.doesNotMatch(calls, /dummy-secret|--no-owner|--no-acl|--no-privileges|--clean/);
  assert.match(calls, /url=unset/);
  assert.match(calls, /service=test-backup-service/);
});

test('failed dump or archive listing removes only the new partial output', shell, t => {
  for (const env of [{ FAKE_DUMP_FAIL: '1' }, { FAKE_LIST_FAIL: '1' }]) {
    const f = fixture(t);
    writeFileSync(join(f.output, 'keep-existing'), 'unrelated');
    const result = f.run('backup.sh', [f.output], env);
    assert.notEqual(result.status, 0);
    assert.deepEqual(readdirSync(f.output), ['keep-existing']);
    assert.equal(readFileSync(join(f.output, 'keep-existing'), 'utf8'), 'unrelated');
    assert.doesNotMatch(result.stdout + result.stderr, /dummy-secret/);
    assert.doesNotMatch(result.stdout, /verified/i);
  }
});

test('a cleanup failure is reported instead of claiming the partial archive is gone', shell, t => {
  const f = fixture(t);
  writeFileSync(join(f.dir, 'bin', 'rm'), '#!/usr/bin/env bash\nexit 1\n', { mode: 0o755 });
  const result = f.run('backup.sh', [f.output], { FAKE_DUMP_FAIL: '1' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /could not remove the partial archive/i);
  assert.match(result.stderr, /directory remains/i);
  assert.equal(readdirSync(f.output).length, 1);
  assert.doesNotMatch(result.stdout + result.stderr, /dummy-secret/);
});

test('old drill entry points create only an archive and never pretend a restore was performed', shell, t => {
  for (const name of ['production-drill.sh', 'disaster-recovery-drill.sh']) {
    const f = fixture(t);
    const noOutput = f.run(name, [], { OUT_DIR: '' });
    assert.notEqual(noOutput.status, 0);
    assert.equal(f.log(), '');
    const result = f.run(name, [], { OUT_DIR: f.output });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout + result.stderr, /not.*restore|no restore/i);
    assert.equal((f.log().match(/pg_dump:/g) || []).length, 1);
    assert.match(f.log(), /pg_restore: <--list>/);
    assert.doesNotMatch(f.log(), /--clean|--dbname|dummy-secret/);
  }
});

test('common database backup artifacts are git-ignored as a second line of defense', () => {
  for (const file of ['backups/private.json', 'source/AI-Syed-Jalal-FINAL-RECOVERED/backups/database.dump', 'accidental.dump', 'accidental.backup', '.env', 'deployment/.env.production', '.pgpass', '.pg_service.conf']) {
    const result = spawnSync('git', ['check-ignore', '--no-index', '-q', file], { cwd: resolve(app, '../..') });
    assert.equal(result.status, 0, `${file} should not be accidentally staged`);
  }
  for (const example of ['.env.example', 'deployment/.env.production.example']) {
    const result = spawnSync('git', ['check-ignore', '--no-index', '-q', example], { cwd: resolve(app, '../..') });
    assert.equal(result.status, 1, `${example} remains available as a non-secret example`);
  }
});

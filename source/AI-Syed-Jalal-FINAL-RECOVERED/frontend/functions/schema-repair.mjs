// Applies the bundled additive migrations to a database that is behind.
//
// Kept separate from the HTTP handler so it can be tested against a real
// Postgres engine without importing the Cloudflare runtime.
import { SCHEMA_PARTS, REQUIRED_TABLES, destructiveStatements } from './schema-bundle.mjs';

/**
 * Split a SQL file into individual statements.
 *
 * The Cloudflare/Neon `query()` path is a prepared statement, so it cannot take
 * several commands at once ("cannot insert multiple commands into a prepared
 * statement"). Splitting naively on ';' would corrupt dollar-quoted blocks and
 * string literals, so this tracks quoting and comments properly.
 */
export function splitSqlStatements(sql) {
  const statements = [];
  let current = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];
    const next = sql[i + 1];

    // line comment
    if (ch === '-' && next === '-') {
      while (i < n && sql[i] !== '\n') current += sql[i++];
      continue;
    }
    // block comment
    if (ch === '/' && next === '*') {
      current += sql[i++]; current += sql[i++];
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) current += sql[i++];
      if (i < n) { current += sql[i++]; current += sql[i++]; }
      continue;
    }
    // single-quoted string ('' is an escaped quote)
    if (ch === "'") {
      current += sql[i++];
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") { current += sql[i++]; current += sql[i++]; continue; }
        if (sql[i] === "'") { current += sql[i++]; break; }
        current += sql[i++];
      }
      continue;
    }
    // double-quoted identifier
    if (ch === '"') {
      current += sql[i++];
      while (i < n) {
        if (sql[i] === '"' && sql[i + 1] === '"') { current += sql[i++]; current += sql[i++]; continue; }
        if (sql[i] === '"') { current += sql[i++]; break; }
        current += sql[i++];
      }
      continue;
    }
    // dollar-quoted block: $$ ... $$ or $tag$ ... $tag$
    if (ch === '$') {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
      if (tag) {
        const marker = tag[0];
        current += marker; i += marker.length;
        while (i < n && sql.slice(i, i + marker.length) !== marker) current += sql[i++];
        if (i < n) { current += marker; i += marker.length; }
        continue;
      }
    }
    if (ch === ';') {
      if (current.trim()) statements.push(current.trim());
      current = '';
      i++;
      continue;
    }
    current += sql[i++];
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

/** Run one migration part, statement by statement. */
export async function runPart(db, sql) {
  const statements = splitSqlStatements(sql);
  for (const statement of statements) await db.query(statement);
  return statements.length;
}

async function tableList(db) {
  const rows = await db.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  return (rows || []).map(r => r.table_name);
}

/** The tables the database is missing, in REQUIRED_TABLES order. */
export async function missingTables(db) {
  const have = new Set(await tableList(db));
  return REQUIRED_TABLES.filter(t => !have.has(t));
}

/** Destructive statements anywhere in the bundle. Must always be empty. */
export function unsafeStatements() {
  return SCHEMA_PARTS.flatMap(p => destructiveStatements(p.sql).map(s => `${p.name}: ${s}`));
}

/**
 * Apply every bundled migration. Additive only, safe to replay.
 * Never throws for an individual part: failures are reported so the caller can
 * show what partly worked instead of a generic 500.
 */
export async function applySchemaRepair(db) {
  const unsafe = unsafeStatements();
  if (unsafe.length) {
    return { ok: false, refused: true, error: 'The schema bundle contains destructive statements', unsafe };
  }
  const before = await tableList(db);
  const missingBefore = REQUIRED_TABLES.filter(t => !before.includes(t));

  const applied = [], failed = [];
  for (const part of SCHEMA_PARTS) {
    try { await runPart(db, part.sql); applied.push(part.name); }
    catch (e) { failed.push({ part: part.name, error: String(e?.message || e).slice(0, 200) }); }
  }

  const after = await tableList(db);
  const missing = REQUIRED_TABLES.filter(t => !after.includes(t));
  return {
    ok: missing.length === 0,
    changed: missingBefore.length > 0,
    before: before.length,
    after: after.length,
    required: REQUIRED_TABLES.length,
    missingBefore,
    missing,
    applied,
    failed
  };
}

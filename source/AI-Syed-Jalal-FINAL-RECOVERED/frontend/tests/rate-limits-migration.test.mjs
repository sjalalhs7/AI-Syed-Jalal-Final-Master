import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(new URL("../../backend/db/migrations/005_v127_auth_rate_limits.sql", import.meta.url), "utf8");
const schema = await readFile(new URL("../../backend/db/schema.sql", import.meta.url), "utf8");

test("V127 creates a persistent atomic rate-limit table with hashed subjects", () => {
  for (const source of [migration, schema]) {
    assert.match(source, /CREATE TABLE IF NOT EXISTS auth_rate_limits/);
    assert.match(source, /PRIMARY KEY \(scope, subject_hash\)/);
    assert.match(source, /last_request_id uuid NOT NULL/);
    assert.match(source, /tokens numeric\(12,6\) NOT NULL CHECK \(tokens >= 0\)/);
  }
  assert.match(migration, /idx_auth_rate_limits_updated_at/);
  assert.match(migration, /raw IP addresses are never persisted/);
});

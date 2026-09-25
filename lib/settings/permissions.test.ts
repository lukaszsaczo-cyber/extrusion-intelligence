import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PERMISSIONS, can } from "./permissions.ts";

test("the matrix shown in Settings is the one the database test checks", () => {
  const sql = readFileSync(new URL("../../supabase/tests/permissions_matrix.sql", import.meta.url), "utf8");
  const m = sql.match(/expected jsonb := '(\{.*\})';/);
  assert.ok(m, "expected matrix not found in permissions_matrix.sql");
  assert.deepEqual(JSON.parse(m[1]!), PERMISSIONS);
});

test("engine results are written by nobody in the app; viewers only read", () => {
  for (const r of ["ADMIN", "ENGINEER", "OPERATOR", "VIEWER"] as const) assert.equal(can(r, "engine_results"), false);
  assert.deepEqual(Object.entries(PERMISSIONS).filter(([, roles]) => (roles as readonly string[]).includes("VIEWER")).map(([a]) => a), ["view"]);
});

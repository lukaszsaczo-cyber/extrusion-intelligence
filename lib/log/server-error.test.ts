import assert from "node:assert/strict";
import { test } from "node:test";
import { errorLine } from "./server-error.ts";

test("logs scope, Postgres code and the guard token only", () => {
  assert.equal(errorLine("recordFailStep", { code: "23514", message: "fail_order: FILTER cannot follow VERIFY_PERSIST" }),
    "[ei:recordFailStep] failed code=23514 token=fail_order");
  assert.equal(errorLine("approvePlan", { code: "42501", message: "forbidden" }), "[ei:approvePlan] failed code=42501 token=forbidden");
});

test("never leaks the message body, values, ids or secrets", () => {
  const leaky = {
    code: "23505",
    message: 'duplicate key value violates unique constraint "x" DETAIL: Key (email)=(a@b.pl) already exists; key vck_SECRET123',
  };
  const line = errorLine("createSite", leaky);
  assert.equal(line, "[ei:createSite] failed code=23505 token=-");
  for (const bad of ["a@b.pl", "vck_", "SECRET", "DETAIL", "duplicate"]) assert.ok(!line.includes(bad), bad);
  assert.equal(errorLine("x", { code: "not a code; drop table", message: null }), "[ei:x] failed code=- token=-");
});

test("engine failures carry the contract errorId; unsafe detail is dropped", () => {
  assert.equal(errorLine("requestEngineDecision", null, { reason: "engine_answer", errorId: "ENGINE_TIMEOUT" }),
    "[ei:requestEngineDecision] failed code=- token=- reason=engine_answer errorId=ENGINE_TIMEOUT");
  assert.equal(errorLine("x", null, { errorId: "has space; token=abc" }), "[ei:x] failed code=- token=-");
});

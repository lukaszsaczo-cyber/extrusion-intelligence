// Proves the client/server import boundary rule fires; a clean lint alone would
// not show that. Uses the real eslint.config.mjs against in-memory sources.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ESLint } from "eslint";

const eslint = new ESLint();
const RULE = "ei/no-server-import-in-client";

async function lint(code, filePath = "components/probe.tsx") {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m) => m.ruleId === RULE || m.ruleId === "no-restricted-imports");
}

test("client component may not import server modules", async () => {
  const msgs = await lint('"use client";\nimport { createEngine } from "@/server/engine";\nexport const x = createEngine;\n');
  assert.ok(msgs.some((m) => m.ruleId === RULE), JSON.stringify(msgs));
});

test("client component may not import server-only lib modules", async () => {
  const msgs = await lint('"use client";\nimport { getT } from "@/lib/i18n";\nexport const x = getT;\n', "app/probe/page.tsx");
  assert.deepEqual(msgs.map((m) => m.ruleId), [RULE]);
});

test("client component may not import the server-only package", async () => {
  const msgs = await lint('"use client";\nimport "server-only";\nexport const x = 1;\n', "app/probe/page.tsx");
  assert.deepEqual(msgs.map((m) => m.ruleId), [RULE]);
});

test("client component may import server actions", async () => {
  const msgs = await lint('"use client";\nimport { importRunFile } from "@/server/import";\nexport const x = importRunFile;\n');
  assert.deepEqual(msgs, []);
});

test("type-only imports are allowed", async () => {
  const msgs = await lint('"use client";\nimport type { Snapshot } from "@/lib/diagnosis/snapshot";\nimport type { X } from "@/server/engine";\nexport type Y = Snapshot | X;\n', "app/probe/page.tsx");
  assert.deepEqual(msgs, []);
});

test("server components may import server modules", async () => {
  const msgs = await lint('import { getT } from "@/lib/i18n";\nimport { getSessionContext } from "@/server/context";\nexport const x = [getT, getSessionContext];\n', "app/probe/page.tsx");
  assert.deepEqual(msgs, []);
});

test("components/ also blocks non-action server modules by path (spec letter)", async () => {
  const msgs = await lint('import { getSessionContext } from "@/server/context";\nexport const x = getSessionContext;\n');
  assert.deepEqual(msgs.map((m) => m.ruleId), ["no-restricted-imports"]);
});

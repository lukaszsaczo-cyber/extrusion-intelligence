import assert from "node:assert/strict";
import { test } from "node:test";
import { AUTO_REQUIREMENTS, WRITES_TO_MACHINE, sourceModes } from "./source.ts";

test("manual/file is available; automatic is not, while there is no live source", () => {
  const [manual, auto] = sourceModes();
  assert.equal(manual.mode, "MANUAL");
  assert.equal(manual.available, true);
  assert.equal(auto.mode, "AUTO");
  assert.equal(auto.available, false);
  if (!auto.available) assert.deepEqual([...auto.requires], [...AUTO_REQUIREMENTS]);
});

test("the automatic mode requires the CSV chain first (canon) and never writes to the machine", () => {
  assert.ok(AUTO_REQUIREMENTS.includes("CSV_CHAIN_PASSED"));
  assert.ok(AUTO_REQUIREMENTS.includes("GATEWAY_READ_ONLY"));
  assert.equal(WRITES_TO_MACHINE, false);
});

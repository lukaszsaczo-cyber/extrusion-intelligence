// Negative controls for the secret scanner: it must find a planted canary,
// and "nothing scanned" must never count as PASS.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { listFiles, scan, verdict } from "./lib/secret-scan.mjs";

function fixture(contents) {
  const dir = mkdtempSync(join(tmpdir(), "ei-scan-"));
  mkdirSync(join(dir, "chunks"));
  contents.forEach((c, i) => writeFileSync(join(dir, "chunks", `c${i}.js`), c));
  return listFiles(dir);
}

test("a planted canary is found (FAIL)", () => {
  const files = fixture(["var a=1;", 'var k="eicanaryPLANTED0123";']);
  const results = scan(files, { EXTRUSION_CORE_API_TOKEN: "eicanaryPLANTED0123" });
  assert.deepEqual(results, [{ name: "EXTRUSION_CORE_API_TOKEN", status: "FAIL", files: 1 }]);
  assert.equal(verdict(results), "FAIL");
});

test("absent canaries pass", () => {
  const results = scan(fixture(["var a=1;"]), { A: "eicanaryABSENT0001", B: "eicanaryABSENT0002" });
  assert.equal(verdict(results), "PASS");
});

test("nothing scanned is NOT RUN, never PASS", () => {
  const results = scan(fixture(["x"]), { A: undefined, B: "short" });
  assert.equal(verdict(results), "NOT RUN");
});

test("partial scan with a leak is FAIL", () => {
  const results = scan(fixture(["leak eicanaryLEAKED00001"]), { A: undefined, B: "eicanaryLEAKED00001" });
  assert.equal(verdict(results), "FAIL");
});

test("missing directory is reported, not treated as clean", () => {
  assert.equal(listFiles(join(tmpdir(), "ei-scan-does-not-exist-xyz")), null);
});

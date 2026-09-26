// Negative controls for the protected-term scan: a planted term must be found in
// every scanned area, the term itself must never appear in the report, and an
// unconfigured guard or missing input is NOT RUN, never PASS.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { describePart, loadGuard, runTermScan } from "./lib/term-scan.mjs";

const KEY = "k".repeat(16) + "test-only-term-scan-key-0123456789";
const TERM = "Kryptonite Blend"; // fixture term, not a real protected term
const termsFile = () => { const d = mkdtempSync(join(tmpdir(), "terms-")); const f = join(d, "terms.txt"); writeFileSync(f, `${TERM}\n`); return f; };

function fixture({ chunk = "var a=1;", server = "{}", messages = '{"a":"Recipe"}', build = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), "termscan-"));
  if (build) {
    mkdirSync(join(root, ".next/static/chunks"), { recursive: true });
    mkdirSync(join(root, ".next/server/app"), { recursive: true });
    writeFileSync(join(root, ".next/static/chunks/main.js"), chunk);
    writeFileSync(join(root, ".next/server/app/page.html"), server);
  }
  mkdirSync(join(root, "messages"));
  writeFileSync(join(root, "messages/pl.json"), messages);
  return root;
}

test("no key or no terms -> NOT RUN, never PASS", async () => {
  assert.equal(loadGuard({}).guard, null);
  assert.equal(loadGuard({ TERM_GUARD_KEY: KEY }).guard, null);
  assert.equal(loadGuard({ TERM_GUARD_KEY: "short", TERM_GUARD_TERMS_FILE: termsFile() }).guard, null);
  const r = await runTermScan({ guard: null, root: fixture() });
  assert.equal(r.verdict, "NOT RUN");
  assert.ok(r.parts.every((p) => p.status === "NOT RUN"));
});

test("a planted term is found in a client chunk, server output and messages, in any case and spacing", async () => {
  const { guard } = loadGuard({ TERM_GUARD_KEY: KEY, TERM_GUARD_TERMS_FILE: termsFile() });
  assert.ok(guard);
  const r = await runTermScan({ guard, root: fixture({
    chunk: 'var t="x KRYPTONITE blend y";', server: "<p>kryptonite_blend</p>", messages: '{"a":"Kryptonite-Blend"}',
  }) });
  assert.deepEqual(r.parts.slice(0, 2).map((p) => [p.status, p.hits.length]), [["FAIL", 2], ["FAIL", 1]]);
  assert.equal(r.verdict, "FAIL");
  const report = r.parts.map(describePart).join("\n").toUpperCase();
  assert.ok(!report.includes("KRYPTONITE"), "the report must not contain the term");
});

test("clean build and messages PASS, but the verdict stays NOT RUN until API responses are scanned", async () => {
  const { guard } = loadGuard({ TERM_GUARD_KEY: KEY, TERM_GUARD_TERMS_FILE: termsFile() });
  const r = await runTermScan({ guard, root: fixture() });
  assert.deepEqual(r.parts.map((p) => p.status), ["PASS", "PASS", "NOT RUN"]);
  assert.equal(r.verdict, "NOT RUN");
});

test("missing build output is NOT RUN, not a clean PASS", async () => {
  const { guard } = loadGuard({ TERM_GUARD_KEY: KEY, TERM_GUARD_TERMS_FILE: termsFile() });
  const r = await runTermScan({ guard, root: fixture({ build: false }) });
  assert.equal(r.parts[0].status, "NOT RUN");
});

test("API responses are fetched and scanned; a leaking response FAILs, a clean one PASSes", async () => {
  const { guard } = loadGuard({ TERM_GUARD_KEY: KEY, TERM_GUARD_DIGESTS: JSON.stringify(
    (await import("node:module")).createRequire(import.meta.url)("../server/engine-contract/src/term-guard.js").digestTerms(KEY, [TERM])) });
  const server = createServer((req, res) => res.end(req.url === "/leak" ? '{"note":"kryptonite blend"}' : '{"connected":false}'));
  await new Promise((ok) => server.listen(0, ok));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const clean = await runTermScan({ guard, root: fixture(), baseUrl: base, paths: ["/api/health"] });
    assert.equal(clean.verdict, "PASS");
    const leak = await runTermScan({ guard, root: fixture(), baseUrl: base, paths: ["/api/health", "/leak"] });
    assert.deepEqual([leak.parts[2].status, leak.parts[2].hits], ["FAIL", ["/leak (200)"]]);
  } finally { server.close(); }
});

test("documented limit of the contract guard: a term glued inside a longer word is not detected", async () => {
  const { guard } = loadGuard({ TERM_GUARD_KEY: KEY, TERM_GUARD_TERMS_FILE: termsFile() });
  assert.equal(guard.isClean("xKryptoniteBlendx"), true);
});

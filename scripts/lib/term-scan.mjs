// Protected-term scan (spec 18): build output, client chunks, messages and API
// responses are checked with the contract's own term guard (HMAC-SHA256
// digests, token n-grams up to 3 words). No term is ever stored or printed in
// plaintext: reports name only files or API paths and counts.
//
// Configuration (all optional; without key AND digests the result is NOT RUN):
//   TERM_GUARD_KEY           >= 32 chars (secret)
//   TERM_GUARD_DIGESTS       JSON array of digests (output of tools/hash-terms.js)
//   TERM_GUARD_DIGESTS_FILE  file with that JSON array
//   TERM_GUARD_TERMS_FILE    plain terms, one per line, kept OUTSIDE the repo;
//                            hashed in memory only
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { extname, relative } from "node:path";
import { listFiles } from "./secret-scan.mjs";

const require = createRequire(import.meta.url);
const { createGuard, digestTerms } = require("../../server/engine-contract/src/term-guard.js");

const TEXT_EXT = new Set([".js", ".mjs", ".cjs", ".json", ".html", ".rsc", ".txt", ".css", ".body", ".meta", ".map"]);

export function loadGuard(env = process.env) {
  const key = env.TERM_GUARD_KEY;
  if (!key || key.length < 32) return { guard: null, reason: "TERM_GUARD_KEY not set (or shorter than 32 characters)" };
  let digests = [];
  try {
    if (env.TERM_GUARD_DIGESTS) digests = JSON.parse(env.TERM_GUARD_DIGESTS);
    else if (env.TERM_GUARD_DIGESTS_FILE && existsSync(env.TERM_GUARD_DIGESTS_FILE)) digests = JSON.parse(readFileSync(env.TERM_GUARD_DIGESTS_FILE, "utf8"));
    else if (env.TERM_GUARD_TERMS_FILE && existsSync(env.TERM_GUARD_TERMS_FILE)) {
      const terms = readFileSync(env.TERM_GUARD_TERMS_FILE, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
      digests = digestTerms(key, terms);
    }
  } catch {
    return { guard: null, reason: "digests could not be read" };
  }
  if (!Array.isArray(digests) || digests.length === 0) return { guard: null, reason: "no term digests (TERM_GUARD_DIGESTS / _DIGESTS_FILE / _TERMS_FILE)" };
  const guard = createGuard({ key, digests });
  return guard.ready ? { guard, reason: null } : { guard: null, reason: "guard not ready" };
}

// A part is NOT RUN when there was nothing to scan; never PASS on empty input.
function part(name, guard, items, reasonIfEmpty) {
  if (!guard) return { name, status: "NOT RUN", scanned: 0, hits: [], reason: "guard not configured" };
  if (!items) return { name, status: "NOT RUN", scanned: 0, hits: [], reason: reasonIfEmpty };
  if (items.length === 0) return { name, status: "NOT RUN", scanned: 0, hits: [], reason: reasonIfEmpty };
  const hits = items.filter((it) => !guard.isClean(it.text)).map((it) => it.label);
  return { name, status: hits.length ? "FAIL" : "PASS", scanned: items.length, hits, reason: null };
}

const readTextFiles = (root, base) => {
  const files = listFiles(root);
  if (!files) return null;
  return files.filter((f) => TEXT_EXT.has(extname(f))).map((f) => ({ label: relative(base, f), text: readFileSync(f, "utf8") }));
};

export async function runTermScan({ guard, root = process.cwd(), baseUrl = null, paths = ["/api/health"], cookie = null, fetchImpl = globalThis.fetch }) {
  const build = [...(readTextFiles(`${root}/.next/static`, root) ?? []), ...(readTextFiles(`${root}/.next/server`, root) ?? [])];
  const messages = readTextFiles(`${root}/messages`, root);
  let api = null;
  if (baseUrl && guard) {
    api = [];
    for (const p of paths) {
      try {
        const res = await fetchImpl(new URL(p, baseUrl), { headers: cookie ? { cookie } : {}, redirect: "manual" });
        api.push({ label: `${p} (${res.status})`, text: await res.text() });
      } catch {
        api.push({ label: `${p} (unreachable)`, text: "" });
      }
    }
  }
  const parts = [
    part("build output (.next/static, .next/server)", guard, build.length ? build : null, "no build output (run next build first)"),
    part("messages (messages/*.json)", guard, messages, "messages/ not found"),
    part("API responses", guard, api, "no TERM_SCAN_BASE_URL given"),
  ];
  const verdict = parts.some((p) => p.status === "FAIL") ? "FAIL" : parts.every((p) => p.status === "PASS") ? "PASS" : "NOT RUN";
  return { parts, verdict };
}

export const describePart = (p) => p.status === "NOT RUN"
  ? `${p.name}: NOT RUN (${p.reason})`
  : p.status === "PASS" ? `${p.name}: PASS (${p.scanned} scanned)` : `${p.name}: FAIL in ${p.hits.length} of ${p.scanned}: ${p.hits.slice(0, 20).join(", ")}`;

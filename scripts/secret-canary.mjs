// Secret exposure test with canary values (spec amendment): every server-only
// secret is set to a unique random canary, the app is built, and .next/static
// must contain none of them. Never prints canary values.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { describe, listFiles, scan, SECRET_VARS, verdict } from "./lib/secret-scan.mjs";

const canaries = Object.fromEntries(SECRET_VARS.map((name) => {
  const token = `eicanary${randomBytes(12).toString("hex")}`;
  return [name, name.endsWith("_URL") ? `https://${token}.invalid/${token}` : token];
}));

try {
  execFileSync("npx", ["next", "build"], { stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, ...canaries } });
} catch {
  console.error("secret canary: build failed (NOT RUN)");
  process.exit(1);
}
const files = listFiles(".next/static");
if (!files || files.length === 0) { console.error("secret canary: .next/static empty (NOT RUN)"); process.exit(1); }
const results = scan(files, canaries);
console.log(`secret canary scan over ${files.length} files in .next/static:\n  ${results.map(describe).join("\n  ")}`);
const v = verdict(results);
console.log(`secret canary: ${v}`);
process.exit(v === "PASS" ? 0 : 1);

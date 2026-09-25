// Shared by check-bundle.mjs (after every build) and secret-canary.mjs.
// Reports variable names and counts only, never values.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

// Server-only secrets that must never reach browser assets.
export const SECRET_VARS = [
  "SUPABASE_SERVICE_ROLE_KEY", "EXTRUSION_CORE_API_TOKEN", "EXTRUSION_CORE_API_URL", "TERM_GUARD_KEY", "SUPABASE_DB_URL",
];

export function listFiles(root) {
  if (!existsSync(root)) return null;
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else files.push(path);
    }
  };
  walk(root);
  return files;
}

// values: { NAME: value | undefined }. Values shorter than 8 characters are not
// scanned (too likely to match by accident) and count as NOT RUN.
export function scan(files, values) {
  const contents = files.map((f) => readFileSync(f, "utf8"));
  return Object.entries(values).map(([name, value]) => {
    if (!value || value.length < 8) return { name, status: "NOT RUN", files: 0 };
    const hits = contents.filter((c) => c.includes(value)).length;
    return { name, status: hits === 0 ? "PASS" : "FAIL", files: hits };
  });
}

// PASS only if at least one variable was actually scanned and none leaked.
export function verdict(results) {
  if (results.some((r) => r.status === "FAIL")) return "FAIL";
  return results.some((r) => r.status === "PASS") ? "PASS" : "NOT RUN";
}

export const describe = (r) => `${r.name}: ${r.status === "NOT RUN" ? "not set (NOT RUN)" : r.status === "PASS" ? "0 files" : `${r.files} FILES CONTAIN VALUE`}`;

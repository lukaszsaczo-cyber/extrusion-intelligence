// Protected-term scan over build output, messages and API responses
// (scripts/lib/term-scan.mjs). Exit 1 only on FAIL; NOT RUN exits 0 and is
// never reported as PASS. Optional: TERM_SCAN_BASE_URL (e.g. http://localhost:3000),
// TERM_SCAN_PATHS (comma-separated, default /api/health), TERM_SCAN_COOKIE.
import { describePart, loadGuard, runTermScan } from "./lib/term-scan.mjs";

const { guard, reason } = loadGuard();
const paths = (process.env.TERM_SCAN_PATHS ?? "/api/health").split(",").map((s) => s.trim()).filter(Boolean);
const result = await runTermScan({ guard, baseUrl: process.env.TERM_SCAN_BASE_URL || null, paths, cookie: process.env.TERM_SCAN_COOKIE || null });
if (!guard) console.log(`term scan: guard not configured: ${reason}`);
console.log(`term scan:\n  ${result.parts.map(describePart).join("\n  ")}\nterm scan: ${result.verdict}`);
process.exit(result.verdict === "FAIL" ? 1 : 0);

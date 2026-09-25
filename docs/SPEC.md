# Extrusion Intelligence — functional specification and status

Status as of 2026-09-25, checked against this repository and the production
database. "Done" means code or schema exists in the repo; it does not mean the
stage gate was run with PASS evidence. Stage gates are still open.

## Invariants (all stages)

- Next.js, TypeScript strict, PL/EN, Supabase Auth, per-organization isolation
  through RLS.
- The engine is reached only through `server/engine-contract`. No private engine
  fields appear in the UI, and the adapter does not map private fields.
- No demo or example process data. A missing source shows **NOT AVAILABLE**.
- There is no live telemetry in V1. Machine Console LIVE VIEW shows NOT AVAILABLE
  unless a real live source exists. A CSV is never presented as live: it goes to
  Run Data with its filename and import time.
- Missing data is never turned into success. Guards without secrets report
  **NOT RUN**, never PASS.
- Raw evidence (`run_metrics`, `run_files`, `product_measurements`) is
  append-only. Quality problems are handled by quarantine, never by edits.

## Stages

| # | Scope | State in repo | Missing |
|---|---|---|---|
| 1 | Next.js, TS strict, ESLint, PL/EN, layout, Auth | **Gate PASS** (0b2225b): ESLint with a client/server boundary rule proven by 7 tests; tsc, lint, tests, i18n 312/312, build, Vercel deploy | — |
| 2 | Migrations, tables, indexes, RLS | Schema live. Migrations 0006–0012 are in the repo. **Cross-org RLS test PASS** on production 2026-09-25: 28 tables, 146 checks, 0 failures; negative control DETECTS_LEAK; nothing left behind (`supabase/tests/`, `npm run test:rls`) | 0001–0005 are not in the repo (applied earlier) |
| 3 | engine-contract, TS wrapper, API routes | `server/engine-contract`, `server/engine.ts` (server-only), `api/health`. **Secret canary test PASS** 2026-09-25: 5 canaries, 0 of 48 files in `.next/static` (`npm run test:canary`) | Term guard runs with `digests: []`, so it is **not active** (needs `TERM_GUARD_KEY` + terms: NOT RUN); no decision API route |
| 4 | Dashboard, Machines, Machine Console | Dashboard: machines, runs, active runs, audit count, recent decisions / verifications / runs, alerts NOT AVAILABLE (no alert source). Machines: list, signal dictionary, tag mapping, console link. Machine Console: configuration, recorded state, parameters, limits (add CATALOG / CONFIRMED_ON_MACHINE), tags, history with imported file name and time; LIVE VIEW always NOT AVAILABLE (`lib/console/state.ts`, tested) | Logged-in rendering not verified end-to-end (no test login); no live source in V1 by design |
| 5 | Wizard, Preflight, Approval | Wizard (product target → FINAL recipe version → machine → configuration → plan), recipe versions/components/finalize, product targets and values. Preflight = app known-constraints check PASS/FAIL/NEEDS DATA (`lib/preflight/known-limits.ts`, 9 tests), shown apart from the engine decision (NOT AVAILABLE while disconnected, per contract `status = null`). Approval only via `approve_process_plan`. DB approval-flow test PASS 11/11 (`supabase/tests/approval_flow.sql`) | Engine decision not written anywhere yet (needs engine + server-side persistence); logged-in rendering not verified end-to-end |
| 6 | CSV Import, Run Detail, Predicted vs Actual, Verification | CSV import (VALID/SUSPECT/MISSING/UNMAPPED; formulas stored as text are SUSPECT with raw text kept, never evaluated — test). Run Detail: data + files, plan parameters, quality status, product samples/measurements (append-only), Predicted vs Actual via the contract's `compare` on the clean median from the latest state refresh (no unit conversion, ambiguous tags refused), product check vs targets (INCOMPLETE if anything is missing, never PASS), verification records shown read-only (`lib/verification/checks.ts`, 7 tests). DB test PASS 5/5: users (even ADMIN) cannot write verifications or predictions; measurements cannot be changed | Verifications and predictions are written only by the engine, which is not connected: both show NOT AVAILABLE; logged-in rendering not verified end-to-end |
| 7 | History, Audit, JSON export, Settings | Settings (organization, signal dictionary) | History, Audit, JSON export with allowlist |
| 8 | Full audit AR 1–20, AT report | — | not started |

Secret exposure: `npm run test:canary` builds with a unique random canary for
each server-only secret and requires 0 occurrences in `.next/static`. The
scanner's own negative controls (a planted canary is found; nothing scanned is
NOT RUN, never PASS) are in `scripts/secret-scan.test.mjs`. `check-bundle.mjs`
still scans real build-env values after every build and now reports NOT RUN,
not PASS, when no secret is set.

Deviation to be aware of: parts of the diagnostic loop (quality filter,
snapshots, diagnosis gates) were built before stages 5–7 were closed. They do
not replace those stages.

## Extension: FAIL loop (added to the spec, not a rebuild)

The existing chain stays:

    PRODUCT → RECIPE → MACHINE → PREFLIGHT → DECISION → APPROVAL → RUN
    → ACTUAL / DATA → VERIFICATION

The extension starts from VERIFICATION:

    PASS → 38 → 39 → 40 → CROSS → AUDIT

    FAIL → ROZPAD I → 3 (separation) → 6 (quarantine / cleaning)
         → 28 (consolidation) → STATE REFRESH → DIAGNOSIS
         → REPAIR / INTERVENTION → CONTROLLED TEST → VERIFICATION
           (PASS / FAIL / INCONCLUSIVE / INCOMPLETE)

### Rules

1. **Step 6 filters, never deletes.** Raw data → quality check → VALID or
   QUARANTINED with a reason, and the quarantine stays auditable. Verdicts:
   `VALID`, `QUARANTINED`, `INSUFFICIENT_DATA`.
2. **INSUFFICIENT_DATA ≠ INCONCLUSIVE.**
   - INSUFFICIENT_DATA: not enough trustworthy data for any analysis. The app
     names what is missing.
   - INCONCLUSIVE: enough data, but the hypotheses stay unresolved.
3. **Diagnosis gates, in order.** Data trustworthy → machine stable →
   deviation persistent → coupled signals present → recipe / raw material /
   machine separable. If any critical gate fails, the outcome is
   INSUFFICIENT_DATA or INCONCLUSIVE, never a forced cause. Leaving a target
   alone is never enough to name a cause.
4. **Repair needs a controlled test and a new verification.** Its result is one
   of PASS / FAIL / INCONCLUSIVE / INCOMPLETE.
5. **Only a verified PASS may enter 38 → 39 → 40 → CROSS.** A repair that ends in
   FAIL, INCONCLUSIVE or INCOMPLETE is never stored as knowledge. The attempt
   itself is kept in the audit.

### Status of the extension

| Element | State |
|---|---|
| 6: quarantine with reasons, append-only raw data | Done (0006, 0008, 0010, 0012; `lib/quality/rules.ts`) |
| State refresh (snapshot + SHA-256) | Done (0011, `server/diagnosis.ts`) |
| Diagnosis gates, INSUFFICIENT_DATA / INCONCLUSIVE | Done as gates-v0. Three gates always UNKNOWN until their inputs exist |
| ROZPAD I, 3, 28 as explicit steps | Not modelled |
| Cause model (DIAGNOSED) | Not implemented; no engine endpoint |
| Repair / intervention, controlled test | Not implemented |
| Verification writes (`verifications` table) | Table exists, nothing writes to it |
| Knowledge store 38 → 39 → 40 → CROSS with the "verified PASS only" rule | Not implemented |

### Deliberately outside this spec until the data audit

Concrete diagnostic thresholds, sampling frequency and the machine's tag list.
The current rule parameters are starting values tagged `v0-uncalibrated`, not
facts. See `docs/DATA_INPUT_AUDIT.md` for what is needed from the plant.

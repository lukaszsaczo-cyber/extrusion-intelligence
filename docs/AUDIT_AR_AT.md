# Stage 8: full audit AR 1–20 and AT report

Date: 2026-09-25. Code audited: commit `fb30398` (stage 7) on
`claude/ei-app-vercel-deploy-dfjsvz`. Database: production project, migrations
0001–0013.

**What AR 1–20 means here.** No separate AR list exists in the repository or in
the conversation. AR-n is therefore section n of the functional specification
(1 Foundation … 20 Implementation stages), checked requirement by requirement.

**Verdicts.**
- **PASS**: requirement met, with evidence.
- **PARTIAL**: some of it is met; what is missing is named.
- **FAIL**: requirement not met, or contradicted by a test.
- **NOT RUN**: the check could not run here.

Missing evidence is never counted as PASS.

**Applies to every row:** rendering while logged in was not verified
end-to-end. There is no test account, and the database holds no real runs. The
"UI" column therefore shows NOT RUN everywhere, and the verdicts rest on code,
unit tests and database tests.

## Summary

| Verdict | Count | AR |
|---|---|---|
| PASS | 14 | 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 14, 17, 19 |
| PARTIAL | 5 | 7, 13, 15, 16, 20 |
| FAIL | 1 | 18 |

**Update 2026-09-26 (fix 2).** Migrations 0015 and 0016 and the engine
actions give the engine's decision and verification a write path.
`engine_results.sql` passes 25/25.

AR-7 moves from FAIL to PARTIAL, and AR-13 stays PARTIAL. What is left for
both is outside the code:
- **NOT RUN against a live engine:** no URL, token or write key exists yet.
- **The request format is not in the contract:** it must be agreed with the
  engine side (`docs/ENGINE_CONNECTION.md`).

**Update 2026-09-26 (fix 1).** Migration 0014 and the run lifecycle UI close
AR-8 and AR-9. The `run_plan_guard.sql` test passes 20/20, and the other
database tests were re-run after 0014 and still pass. The original audit
(2026-09-25) had 12 PASS, 5 PARTIAL and 3 FAIL, with AR-8 PARTIAL and AR-9
FAIL.

The core chain was **DECISION → APPROVAL → RUN**. APPROVAL → RUN is now
enforced by the database. DECISION now has a tested write path (fix 2) but has
not run against a live engine.

Fixes are listed at the end.

## AR 1–20

| AR | Requirement | Verdict | Evidence / what is missing |
|---|---|---|---|
| 1 | Foundation: Next.js, TS strict, ESLint, PL/EN, Supabase Auth, RLS, engine only via `server/engine-contract`, no private engine fields in UI, no demo data | PASS | <ul><li>tsc and eslint clean.</li><li>i18n 634/634.</li><li>Auth middleware sends every non-public route to `/login` (307).</li><li>The UI reaches the engine only through `server/engine.ts`, which exposes health, the contract's `compare` and `METRICS`.</li><li>Contract test 2: the sanitizer strips every leak field.</li><li>No hits for demo, mock or fake data in `app/`, `components/`, `lib/` or `server/`.</li></ul> |
| 2 | Dashboard: status, machines, active runs, decisions, verifications, alerts, audit, all from real data | PASS | <ul><li>Every tile is a query on stored rows.</li><li>Alerts show NOT AVAILABLE because no alert source exists.</li></ul> |
| 3 | Machines: machine, configuration, status, parameters, limits, history | PASS | <ul><li>Pages `machines`, `machine-console/[id]`.</li><li>Limits are CATALOG or CONFIRMED_ON_MACHINE.</li><li>History shows file name and import time (`lib/console/state.ts`, tests 7–8).</li></ul> |
| 4 | Machine Console: LIVE VIEW is NOT AVAILABLE without a live source; a CSV is never shown as live | PASS | <ul><li>`liveView()` always returns NOT_AVAILABLE (test 6).</li><li>CSV data appears only as Run Data, with file name and time.</li></ul> |
| 5 | Wizard: product → recipe → machine → configuration → plan → preflight | PASS | <ul><li>Pages `new-product`, `recipes/[id]`, `preflight`.</li><li>A FINAL recipe needs components summing to 100 %, and a FINAL version is frozen (approval_flow checks 1–3).</li></ul> |
| 6 | Preflight: known constraints → PASS / FAIL / NEEDS DATA | PASS | <ul><li>`lib/preflight/known-limits.ts`, 9 tests.</li><li>Unknown, other-unit or run-time limits give NEEDS_DATA, never PASS.</li></ul> |
| 7 | Decision returned by the engine through ei-engine-contract | PARTIAL (was FAIL; fix 2, 2026-09-26) | <ul><li>`requestEngineDecision` calls the contract's `adapter.analyzePreflight()`. The sanitized answer is mapped field by field (`lib/engine/results.ts`, 5 tests using the real sanitizer).</li><li>It is stored only by `record_engine_decision` (0015/0016). The database checks:<ul><li>an engine write key held only by the server;</li><li>role ADMIN or ENGINEER;</li><li>the plan did not change since the engine was asked, and is not approved;</li><li>every value is inside the contract; a missing field is refused.</li></ul></li><li>DB test `engine_results.sql` PASS 25/25. It first caught a fail-open bug (a missing field slipped through as NULL), fixed in 0016 before any use.</li><li>Engine not connected: nothing is requested or stored (the contract's `status = null`).</li><li>Open:<ul><li>**NOT RUN** against a live engine (no URL, token or write key);</li><li>the request format `ei-preflight-request-v1` is the app's own and must be agreed with the engine side.</li></ul></li></ul> |
| 8 | Approval with hard database constraints, and DECISION → APPROVAL → RUN | PASS (fixed 2026-09-26) | <ul><li>Approval itself: DB test PASS 11/11.</li><li>0014 adds the rest (`run_plan_guard.sql` PASS 20/20):<ul><li>a run starts only on an approved plan for the same machine;</li><li>an approved plan, or one used by a run, cannot be deleted;</li><li>a plan with a started run cannot be changed, so its approval cannot be voided afterwards.</li></ul></li><li>Before the fix, a probe showed an ENGINEER could delete an approved plan.</li></ul> |
| 9 | Run: recipe, machine, configuration, plan, timestamps, metrics | PASS (fixed 2026-09-26) | <ul><li>The run form links a plan (and through it the recipe version and configuration).</li><li>Run Detail offers:<ul><li>PLANNED → RUNNING → COMPLETED or ABORTED;</li><li>start and end times, now or ISO 8601 with an offset; a time without an offset is refused (`lib/runs/instant.ts`, 2 tests).</li></ul></li><li>The database (0014, test 20/20):<ul><li>creates runs as PLANNED;</li><li>refuses to start without an approved plan, or with a future time;</li><li>fixes plan, machine and start time after the start;</li><li>makes COMPLETED and ABORTED final;</li><li>allows deleting only PLANNED runs.</li></ul></li><li>CSV import into a PLANNED run stays possible for historical plant exports; the RUN step then shows NOT AVAILABLE.</li><li>Before the fix, a probe showed an OPERATOR could start a run on an unapproved plan and re-link it afterwards.</li></ul> |
| 10 | CSV import: MISSING, SUSPECT, formulas stored as text (separate test set) | PASS | <ul><li>8 tests in `lib/import/run-file.test.ts`.</li><li>Formulas stay SUSPECT with the raw text kept and are never evaluated.</li><li>Timestamps without an offset are rejected.</li><li>Thousands separators are rejected.</li></ul> |
| 11 | Run Detail: data, parameters, measurements, quality status, result | PASS | <ul><li>`/runs/[id]`.</li><li>Measurements are append-only: DB verification_guard PASS 5/5.</li></ul> |
| 12 | Predicted vs actual | PASS (logic) | <ul><li>Uses the contract's own `compare` on the clean median, with no unit conversion (tests 51–53).</li><li>Real data is blocked by AR-7: there are no predictions, so the panel shows NOT AVAILABLE, as intended.</li></ul> |
| 13 | Verification: PASS / FAIL / INCONCLUSIVE / INCOMPLETE; missing data is never success | PARTIAL | <ul><li>What holds:<ul><li>states follow the contract;</li><li>the product check never gives PASS on missing data (tests 54–57);</li><li>users, even ADMIN, cannot insert verifications directly.</li></ul></li><li>Fix 2: `requestEngineVerification` calls `adapter.verifyRun()` for a COMPLETED run. `record_engine_verification` stores the state as kind `ENGINE`, because the contract's verification has no kind. Evidence counts only for VERIFIED_PASS with a strict `true` (DB test).</li><li>Open: **NOT RUN** against a live engine. The contract's `observed` values are not stored; there is no table for them yet.</li></ul> |
| 14 | History: runs, decisions, predictions, verifications, events; the chain DECISION → … → VERIFICATION | PASS | <ul><li>`lib/history/timeline.ts`, 3 tests.</li><li>A step without a record is NOT_AVAILABLE.</li></ul> |
| 15 | Audit: events, decisions, verifications, user, time, integrity; print; JSON export; allowlist | **PARTIAL** | <ul><li>What holds:<ul><li>seal, SHA-256 hash chain, integrity check and print;</li><li>DB audit_seal PASS 16/16, which detects an edited, a re-hashed and a removed record;</li><li>the export allowlist (5 tests).</li></ul></li><li>Deviation: the contract defines its own audit export (`buildAuditExport`, `AUDIT_FIELDS`, `finalAuditHash`). The app built a separate format (`ei-audit-export-v1`) instead of using it.</li><li>The snapshot lacks several contract fields: site, serial number, machine configuration snapshot, recipe version, operator, final status.</li></ul> |
| 16 | Settings: organization, users, configuration, permissions, app settings | **PARTIAL** | <ul><li>Present:<ul><li>organization and sites;</li><li>the member list with names;</li><li>configuration;</li><li>the permission matrix, whose 12 × 4 cells match the database (DB test PASS).</li></ul></li><li>Missing: inviting users and changing roles (needs Auth admin). App settings are only the language.</li></ul> |
| 17 | Security: RLS per company with cross-org tests; server-only; ESLint `no-restricted-imports` | PASS | <ul><li>Cross-org RLS PASS: 28 tables, 146 checks; the negative control DETECTS_LEAK.</li><li>ESLint boundary rule: 7 tests.</li><li>`import "server-only"` in `server/engine.ts`, `lib/supabase/server.ts` and `server/people.ts`.</li><li>TRUNCATE was revoked from client roles in 0013.</li><li>Open: Supabase advisor warns that leaked-password protection is off. This is a dashboard setting.</li></ul> |
| 18 | Protected term guard: TERM_GUARD_KEY + HMAC digests; checks build output, client chunks, messages, API responses; without secrets NOT RUN | **FAIL** | <ul><li>The runtime guard exists in the adapter: it fails closed and drops free text.</li><li>The real-term test is NOT RUN (no key, terms or digests).</li><li>**No scan of build output, client chunks, messages or API responses for protected terms exists.** The build scan (`check-bundle`, canary) looks only for secret values.</li></ul> |
| 19 | Secret exposure test with canary values after `next build` | PASS | <ul><li>`npm run test:canary` PASS: 5 canaries, 0 occurrences in `.next/static`.</li><li>The scanner's own negative controls: 5 tests.</li></ul> |
| 20 | Stages 1–8, one commit per stage, gate with PASS evidence before the next | **PARTIAL** | <ul><li>Commits: `0b2225b` (1), `bd8061d` (2), `605530d` (3, part), `e4f0d15` (4), `83ceb3f` (5), `eba28a1` (6), `fb30398` (7), plus this report (8).</li><li>The stage 3 gate is not complete: term guard NOT RUN, and no decision route (see AR-7, AR-18).</li><li>Parts of the diagnostic loop were built before stages 5–7 (documented in `docs/SPEC.md`).</li></ul> |

## AT report (acceptance tests)

All tests below were run on 2026-09-25, against code `fb30398`.

**Database tests** ran on the production database inside a rolled-back
transaction. Afterwards there were 1 organization, 0 test users and 0 runs.

| Suite | Where | Result |
|---|---|---|
| Unit tests `lib/*` | local | 57/57 PASS |
| Script tests (ESLint boundary, secret scanner) | local | 12/12 PASS |
| Engine contract tests | local | 17 PASS, 1 **NOT RUN** (real protected terms) |
| `tsc --noEmit`, `eslint .` | local | PASS |
| i18n parity | local | PASS, PL 634 = EN 634 |
| `next build` | local | PASS |
| Secret canary (`npm run test:canary`) | local | PASS, 5 canaries, 0 files |
| `rls_cross_org.sql` | production DB | PASS, 28 tables, 146 checks |
| `rls_negative_control.sql` | production DB | DETECTS_LEAK (the test can fail) |
| `approval_flow.sql` | production DB | PASS 11/11 |
| `verification_guard.sql` | production DB | PASS 5/5 |
| `audit_seal.sql` | production DB | PASS 16/16 |
| `permissions_matrix.sql` | production DB | PASS, 12 × 4, 0 mismatches |
| Probe: DECISION → APPROVAL → RUN (rolled back) | production DB | FAIL on 2026-09-25 (see AR-8, AR-9); fixed by 0014 |
| `run_plan_guard.sql` (2026-09-26, after 0014) | production DB | PASS 20/20 |
| `engine_results.sql` (2026-09-26, after 0015 and 0016) | production DB | PASS 25/25. The first run was FAIL 2/22, which showed the fail-open bug; fixed in 0016 |
| Secret canary incl. `ENGINE_WRITE_KEY` | local | PASS, 6 canaries, 0 files |
| Re-run after 0014: `rls_cross_org` 146, `approval_flow` 11/11, `verification_guard` 5/5, `audit_seal` 16/16, `permissions_matrix` 12 × 4 | production DB | all PASS |
| Route smoke without a session (`next start`) | local | PASS: all app routes 307 → /login, `/api/health` 200 |
| Vercel deployment of `fb30398` | GitHub status | success |
| Smoke test on the production URL | — | NOT RUN (`*.vercel.app` not reachable from this environment) |
| Logged-in UI rendering | — | NOT RUN (no test account, no real data) |
| `npm run test:rls` via psql | — | NOT RUN (no `SUPABASE_DB_URL`); the same SQL files were run via Supabase MCP above |

## Fixes, in order of risk

1. ~~**AR-8/9: database guard for DECISION → APPROVAL → RUN.**~~ Done
   2026-09-26: migration 0014 and the run lifecycle UI.
2. ~~**AR-7/13: server path for decision and verification.**~~ Done
   2026-09-26 (variant A: narrow functions plus an engine write key, see
   `docs/ENGINE_CONNECTION.md`). Live runs wait for the engine URL, token and
   write key.
   Original note: A server action
   calls `adapter.analyzePreflight()` or `verifyRun()`, and the sanitized
   result is stored through a trusted role. Without the engine, the contract's
   disconnected result applies (`status = null`, nothing stored). This needs
   `SUPABASE_SERVICE_ROLE_KEY` as a secret, or a narrow SECURITY DEFINER RPC
   that accepts only contract-shaped input (to be decided). Real results need
   the engine URL and token.
3. **AR-15: audit export via the contract.** Add the contract's
   `buildAuditExport` output (its `AUDIT_FIELDS` and `finalAuditHash`) to the
   export, and extend the snapshot with site, serial number, machine
   configuration, recipe version and operator.
4. **AR-18: protected-term scan** of `.next` output, `messages/*.json` and API
   responses, using HMAC digests. It reports NOT RUN without `TERM_GUARD_KEY`
   and terms. The code needs no secret; a real PASS needs the key and terms as
   environment secrets.
5. **AR-16:** user invitation and role changes (needs Auth admin, i.e. the
   service role).
6. **AR-17:** enable leaked-password protection in the Supabase dashboard
   (owner action).

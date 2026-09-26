# FAIL loop (v0)

Migration 0018. UI: **FAIL loop** (`/fail-cases`), started from a failing
verification on Run Detail.

    VERIFIED_FAIL → ROZPAD I → 3 → 6 → 28 → ODŚWIEŻENIE → DIAGNOZA
      → NAPRAWA / ODDZIAŁYWANIE → CONTROLLED TEST → VERIFICATION
    only a verified PASS with saved evidence → 38 → 39 → 40 → CROSS

The specification gives the steps' **names** but not their exact content. This
v0 turns each step into an unchangeable record that points at real evidence.
The database enforces the order, the references and the knowledge rule. **The
content of every step below is an interpretation to confirm.**

## Steps

| # | Spec | Record | What the database checks |
|---|---|---|---|
| 1 | ROZPAD I | The failed items of the verification (parameter, state, reason, values) | Written automatically when the case opens; the trigger must be a `VERIFIED_FAIL` |
| 2 | 3, separation | Items in scope and out of scope, plus a note | In-scope items must be failed items from step 1 |
| 3 | 6, quarantine / cleaning | A data-quality assessment (verdict, quarantined count) | Same run; made after the previous step |
| 4 | 28, consolidation | Built by the database: verification, assessment, scope, measurement count, files with SHA-256 | Takes no reference |
| 5 | Odświeżenie | A state snapshot (SHA-256) | Built from the step-3 assessment |
| 6 | Diagnoza | Diagnosis status and cause | A diagnosis of the step-5 snapshot. Without DIAGNOSED the next step can only be step 3 again, with new data; no repair without a named cause |
| 7 | Naprawa | A new plan, the changes (parameter, from, to, unit) and a rationale | Same machine; created after the case opened; not the failed plan |
| 8 | Controlled test | A run on that plan | COMPLETED. Starting it needed an approved decision (0014) |
| 9 | Verification | Verification state | A verification of the test run. It closes the case with its state as the outcome |

Knowledge 38 → 39 → 40 → CROSS:
- one statement per stage, in order, recorded once and never changed;
- allowed only when the case closed with `VERIFIED_PASS` **and** saved
  evidence;
- a trigger refuses anything else, even for the owner role.

A case can also be closed without a verification, with a mandatory reason.
It stays in the record but never becomes knowledge.

## Where a FAIL can come from today

- **Product verification** (`record_product_verification`) is computed in the
  database from stored measurements against the plan's product targets. It
  uses the same rules as the app's product check, and a test shows both give
  the same result on the same data. A user cannot forge the result.
- **Engine verification** (kind ENGINE) has no item details. A case opened
  from it cannot pass step 2 and has to be closed with a reason. Details could
  come later from the contract's `observed` values.

## What is not possible yet, on purpose

- **A named cause (DIAGNOSED)** is written only by a trusted role, i.e. the
  engine. The gates `gates-v0` never reach DIAGNOSED. Until the engine
  provides a cause, a loop cycles between quarantine and diagnosis and cannot
  reach the repair step.
  - This migration also closed a gap: before it, a user could insert
    DIAGNOSED with self-written gates through the API.
- **The content of 3, 28, 38, 39, 40 and CROSS** is a v0 interpretation.
- **The audit seal does not yet include FAIL cases or knowledge.** It covers
  the runs and their verifications.

## Evidence (2026-09-26, production, rolled back)

- `supabase/tests/fail_loop.sql`: 32/32. Covers the full path through a
  loop-back, the trusted-role cause, the controlled test, PASS and knowledge,
  plus a second case closed without PASS whose knowledge is refused.
- `rls_cross_org`: 31 tables, 161 checks, PASS.
- `permissions_matrix`: 13 × 4, PASS.
- `lib/fail-loop/steps.test.ts`: the UI's transition table equals the SQL.

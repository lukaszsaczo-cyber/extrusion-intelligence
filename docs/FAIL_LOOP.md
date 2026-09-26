# FAIL loop (order A)

Migrations 0019 and 0020; 0019 replaces the v0 loop from 0018, whose tables were
empty. UI: **FAIL loop** (`/fail-cases`), started from a failing verification
on Run Detail.

    VERIFIED_FAIL → ROZPAD I → SZCZEGÓŁOWA DIAGNOZA → 3 → 6 → 28 → ODŚWIEŻENIE STANU
      → NAPRAWA → CONTROLLED TEST → WERYFIKACJA → RAPORT
      only a verified PASS with saved evidence → 38 → 39 → 40 → CROSS → AUDIT

The numbers are step codes given by the user, not thresholds:

| Code | Meaning |
|---|---|
| 3 | EXTRACT / SEPARACJA: separate correct from erroneous; nothing is repaired yet |
| 6 | PURGE / CZYSZCZENIE: exclude what 3 marked as erroneous |
| 28 | CONSOLIDATE: build a stable base state from the correct remainder |
| 38 | FILTR |
| 39 | VERIFY + PERSIST |
| 40 | THRESHOLD / LOCK / READ_ONLY (40 is not CROSS) |
| CROSS | the start of a new cycle |

Each step is an unchangeable record that points at real evidence. The database
function `record_fail_step` enforces the order, the references and the
knowledge rule. The UI only offers the one step that can come next.

## Steps

| Step | Record | What the database checks |
|---|---|---|
| ROZPAD I | Every item of the failing verification: parameter, state, reason, values | Written when the case opens; the trigger must be a `VERIFIED_FAIL` |
| Szczegółowa diagnoza | Diagnosis status and cause | A diagnosis of the failed run, made after the previous step |
| 3 EXTRACT | From a data-quality assessment: correct and erroneous signals; correct and erroneous product items (from ROZPAD I) | Same run; made after the previous step. Nothing is repaired |
| 6 PURGE | Excluded samples and signals, the failed items, the rejected failed plan | Takes no reference. **Raw data is never deleted** (append-only); the exclusion is recorded by reference |
| 28 CONSOLIDATE | A state snapshot (SHA-256, clean samples) and the kept items | The snapshot must be built from step 3's assessment |
| Odświeżenie stanu | The base snapshot | Refused if a newer state of the run exists |
| Naprawa | A new plan, the changes (parameter, from, to, unit) and a rationale | Only if the latest diagnosis is DIAGNOSED. Same machine; created after the case opened; not the failed plan |
| Controlled test | A run on that plan | COMPLETED. Starting it needed an approved decision (0014) |
| Weryfikacja | Verification state | A verification of the test run; it sets the case outcome |
| Raport | Outcome, number of cycles and diagnoses, the changes | If the outcome is not a verified PASS with evidence, the case closes here, never knowledge |
| 38 FILTR | Items that were erroneous at 3 and are now a verified PASS, with the change that did it | Refused if nothing passes |
| 39 VERIFY + PERSIST | Re-check, then one knowledge record (the 38 result) | For a product verification, the check is run again on the current measurements; a new bad measurement blocks it |
| 40 LOCK | Threshold and lock time | Threshold = verified PASS with saved evidence, re-checked at 39. **No numeric threshold.** After 40 the case is read-only (trigger) |
| CROSS | The repair plan as the new baseline | — |
| AUDIT | An audit record | A seal of the controlled test run, made after CROSS, whose snapshot (audit-v3) contains this case with its CROSS step. Closes the case |

### The loop-back rule

After ODŚWIEŻENIE STANU:
- if the latest diagnosis names a cause (DIAGNOSED), the next step is NAPRAWA;
- otherwise the next step is a new diagnosis, and it must be a diagnosis of the
  base state from 28. The loop then goes through 3 → 6 → 28 again.

A cause is never forced. INSUFFICIENT_DATA and INCONCLUSIVE are kept as they are.

### Closing early

A case can be closed with a mandatory reason, but only before WERYFIKACJA.
After that it ends with RAPORT. A closed case stays in the record and never
becomes knowledge.

## Where a FAIL can come from today

- **Product verification** (`record_product_verification`) is computed in the
  database (`private.product_check`) from stored measurements against the
  plan's product targets. A user cannot forge the result.
- **Engine verification** (kind ENGINE) has no item details. Its ROZPAD I is
  empty, so 3 marks no product item as erroneous and 38 has nothing to pass.
  Details could come later from the contract's `observed` values.

## What is not possible yet, on purpose

- **A named cause (DIAGNOSED)** is written only by a trusted role, i.e. the
  engine. The gates `gates-v0` never reach DIAGNOSED. Until the engine provides
  a cause, a loop cycles through diagnosis → 3 → 6 → 28 and cannot reach NAPRAWA.
- **Canon B** (CZARNA WODA, KHRR) is not defined and not built.

## Audit

Seals are `audit-v3` (0019). They add `fail_cases`: the cases in which the run
failed or was the controlled test. Each case includes its steps (seq, step,
reference, who, when) and the knowledge record id. The JSON export allowlist
covers these fields.

## Evidence (2026-09-26, production, rolled back)

- `supabase/tests/fail_loop.sql`: 37/37 PASS. Covers:
  - the full path with two cycles (20 steps);
  - the loop-back to a diagnosis of the base state;
  - the 39 re-check blocked by a new bad measurement;
  - the 40 lock (read-only);
  - AUDIT with audit-v3;
  - a second case closed with a reason, where even the owner role cannot
    force knowledge.

  This test found a type error in step 39 (0019), which 0020 fixes.
- `rls_cross_org`: 31 tables, 161 checks, PASS.
- `audit_seal` (audit-v3): 16/16 PASS.
- `permissions_matrix`: 13 × 4, PASS.
- `lib/fail-loop/steps.test.ts`: the UI's transition table, step list and
  reference steps equal the SQL.

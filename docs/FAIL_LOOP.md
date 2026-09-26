# FAIL loop (working canon)

Migrations 0019–0021:
- 0019 replaced the v0 loop from 0018, whose tables were empty;
- 0021 applies the working canon (`docs/CANON.md`): no separate RAPORT step,
  and 38 is the evidence gate after WERYFIKACJA.

UI: **FAIL loop** (`/fail-cases`), started from a failing verification on Run
Detail.

    VERIFIED_FAIL → ROZPAD I → SZCZEGÓŁOWA DIAGNOZA → 3 ODDZIELENIE → 6 FILTR / WYKLUCZENIE
      → 28 KONSOLIDACJA → ODŚWIEŻENIE STANU → NAPRAWA → TEST → WERYFIKACJA
      → 38 FILTR DOWODÓW (gate: pass to 39, or record and close)
      → 39 WERYFIKACJA + UTRWALENIE → 40 LOCK / READ_ONLY → CROSS → AUDIT

The numbers are step codes, not thresholds. Their meanings are in
`docs/CANON.md`.

Each step is an unchangeable record that points at real evidence. The database
function `record_fail_step` enforces the order, the references and the
knowledge rule. The UI only offers the one step that can come next.

## Steps

| Step | Record | What the database checks |
|---|---|---|
| ROZPAD I | Every item of the failing verification: parameter, state, reason, values | Written when the case opens; the trigger must be a `VERIFIED_FAIL` |
| Szczegółowa diagnoza | Diagnosis status and cause | A diagnosis of the failed run, made after the previous step |
| 3 ODDZIELENIE | From a data-quality assessment: correct and erroneous signals; correct and erroneous product items (from ROZPAD I) | Same run; made after the previous step. Nothing is repaired |
| 6 FILTR / WYKLUCZENIE | Excluded samples and signals, the failed items, the rejected failed plan | Takes no reference. **Raw data is never deleted** (append-only); the exclusion is recorded by reference |
| 28 KONSOLIDACJA | A state snapshot (SHA-256, clean samples) and the kept items | The snapshot must be built from step 3's assessment |
| Odświeżenie stanu | The base snapshot | Refused if a newer state of the run exists |
| Naprawa | A new plan, the changes (parameter, from, to, unit) and a rationale | Only if the latest diagnosis is DIAGNOSED. Same machine; created after the case opened; not the failed plan |
| Controlled test | A run on that plan | COMPLETED. Starting it needed an approved decision (0014) |
| Weryfikacja | Verification state | A verification of the test run; it sets the case outcome |
| 38 FILTR DOWODÓW | `result` PASSED or NOT_PASSED; the items that were erroneous at 3 and are now a verified PASS, with the change that did it; outcome, number of cycles and diagnoses | The gate. PASSED only for a verified PASS with saved evidence and at least one repaired item. NOT_PASSED closes the case, never knowledge |
| 39 WERYFIKACJA + UTRWALENIE | Re-check, then one knowledge record (the 38 result) | For a product verification, the check is run again on the current measurements; a new bad measurement blocks it |
| 40 LOCK / READ_ONLY | Lock time | The state is verified (38), persisted (39) and locked. **No numeric threshold.** After 40 the case is read-only (trigger) |
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
After that, 38 decides. A closed case stays in the record and never
becomes knowledge.

## Where a FAIL can come from today

- **Product verification** (`record_product_verification`) is computed in the
  database (`private.product_check`) from stored measurements against the
  plan's product targets. A user cannot forge the result.
- **Engine verification** (kind ENGINE) has no item details. Its ROZPAD I is
  empty, so 3 marks no product item as erroneous and 38 closes the case
  (NOT_PASSED).
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

- `supabase/tests/fail_loop.sql`: 40/40 PASS after 0021. Covers:
  - the full path with two cycles (19 steps);
  - the loop-back to a diagnosis of the base state;
  - 39 refused before 38;
  - no closing after WERYFIKACJA;
  - a second case whose test FAILS, stopped by 38 (NOT_PASSED, closed, no
    39, even the owner role cannot force knowledge);
  - the 39 re-check blocked by a new bad measurement;
  - the 40 lock;
  - AUDIT with audit-v3;
  - a third case closed with a reason.
- The 0019 run of this test found a type error in step 39, fixed in 0020.
- `rls_cross_org`: 31 tables, 161 checks, PASS.
- `audit_seal` (audit-v3): 16/16 PASS.
- `permissions_matrix`: 13 × 4, PASS.
- `lib/fail-loop/steps.test.ts`: the UI's transition table, step list and
  reference steps equal the SQL of 0021.

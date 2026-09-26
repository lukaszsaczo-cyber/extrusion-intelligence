# Canon (working version, frozen 2026-09-26)

This is the working canon agreed with the owner. It replaces the earlier order A
("… → RAPORT → 38 …") and keeps A and B apart. Nothing here is a numeric
threshold. 3, 6, 28, 38, 39 and 40 are step codes.

## A: the application's FAIL loop (implemented)

    FAIL
     → ROZPAD I
     → SZCZEGÓŁOWA DIAGNOZA
     → 3  ODDZIELENIE
     → 6  FILTR / WYKLUCZENIE
     → 28 KONSOLIDACJA
     → ODŚWIEŻENIE STANU
     → NAPRAWA
     → TEST
     → WERYFIKACJA
     → 38 FILTR DOWODÓW
     → 39 WERYFIKACJA + UTRWALENIE
     → 40 LOCK / READ_ONLY
     → CROSS
     → AUDIT

| Code | Meaning in the application |
|---|---|
| 3 ODDZIELENIE | Separate correct from erroneous (data signals and product items). Nothing is repaired yet |
| 6 FILTR / WYKLUCZENIE | Mark what 3 found erroneous as excluded, and reject the failed plan. **Raw material stays available for the audit.** Its process status changes, not its history |
| 28 KONSOLIDACJA | Build a stable base state from the correct remainder: a snapshot of clean samples |
| 38 FILTR DOWODÓW | The quality gate before 39 and 40, after the repair, the test and the verification. It passes only items that were erroneous at 3 and now have a verified PASS with saved evidence. Anything else is recorded and closes the case: a FAIL is never knowledge |
| 39 WERYFIKACJA + UTRWALENIE | Re-check on the current evidence, then persist the 38 result as knowledge |
| 40 LOCK / READ_ONLY | The state is verified, persisted and locked against accidental change. **No numeric threshold.** A numeric threshold would need its own definition and evidence |
| CROSS | A new cycle starts from the locked state |

Rules that belong to A but are not drawn on the diagram:
- After ODŚWIEŻENIE STANU, NAPRAWA needs a named cause. Without one, the next
  step is a new diagnosis of the base state from 28, and the loop goes through
  3 → 6 → 28 again. A cause is never forced; INSUFFICIENT_DATA and
  INCONCLUSIVE stay as they are.
- A case can be closed with a reason only before WERYFIKACJA. After WERYFIKACJA,
  38 decides.

Implementation: migrations 0019–0021, `docs/FAIL_LOOP.md`.

## B: abstract core record (not implemented)

    ROZPAD → CZARNA WODA → 38 → 3 → 6 → 28 → 39 → KHRR → 40 → CROSS

B is not a second order of the same loop. It is a separate, more abstract
record of the core. The current material has no hard definition of
**CZARNA WODA** or **KHRR**. They are not invented here and are not in the
application logic.

## Guided dialog: a layer above the core (not a core step)

    USER → GUIDED DIALOG → is information missing?
             yes → one short question → clarification ─┐
             no  ──────────────────────────────────────┴→ CORE (FAIL → … → 40)

The layer has one job: to save tokens and to guide the user. It is not part of
3/6/28/38/39/40.

| Layer | Role |
|---|---|
| Guided dialog | Guides the user, asks at most one short question |
| 3 / 6 / 28 | Operates on information |
| Repair / test | Does the work |
| 38 / 39 / 40 | Secures the result |
| CROSS | Starts the next cycle |

Where it lives:
- **In the chatbot** (the `chatbot` repository).
- In this application, the loop is driven by forms that offer only the one step
  that can come next. That is already a closed form of guidance, so there is no
  free-text dialog here.

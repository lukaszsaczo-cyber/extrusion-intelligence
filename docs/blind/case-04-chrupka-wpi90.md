# Case 04: our line, chrupka from WPI 90

Status: **SEALED** (predictions frozen 2026-09-26). No trial run yet.

This is the first blind case on our own machine. The product exists in the app as
"Chrupka": target protein 87–88 % (dry basis), main ingredient WPI 90, structure
"medium: not too puffy, not too moist" (owner's words). Rules as in
[PROTOCOL.md](PROTOCOL.md).

## Why these predictions are conditional

We do not know the chrupka's current settings and will not guess them. Every prediction
is a **direction relative to a baseline B** that the operator chooses and records. Step
sizes are the operator's choice; the predictions do not depend on them, as long as the
step is large enough to measure (see scoring).

EI stays read-only: the operator changes the machine, and EI only reads the result.

## Trial plan (one factor at a time around B)

| Run | Change from B | Everything else |
|---|---|---|
| B | baseline, as the operator runs the chrupka today | — |
| W− | less water (pump 32) | as B |
| W+ | more water | as B |
| N+ | higher screw speed | as B |
| F+ | higher dosing feed rate | as B |
| T+ | higher setpoint of the last barrel zone (zone 5) | as B |
| B2 | back to B | repeat check: shows drift over the day |

Each run is held until the operator judges it steady, and the start and end times are
noted. Samples per run: at least one bag after the dryer, labelled with the run and time.

## Data used for scoring

- **Process:** Fitsys+ CSV export of the whole trial, after AUDIT 0: die pressure,
  motor load (torque %), SME, material temperature (Mat. 1), screw speed, water and
  feeder rates.
- **Product, lab:**
  - moisture after the dryer;
  - protein (N × 6.38) on the finished piece and on the WPI lot used, both on dry basis;
  - bulk density;
  - sectional expansion index = (piece diameter / die hole diameter)², by calliper,
    10 pieces per run.
- **Scoring rule:** a direction counts only if the mean of the run differs from B by more
  than twice the standard deviation of B's steady segment (process signals) or of the
  10–piece sample (product). A smaller difference scores **NO EFFECT SEEN**. That is a
  miss for a prediction of change and a hit for a prediction of no change. This is a
  statistical scoring rule, not a technological threshold.

## Predictions (frozen)

| ID | Prediction | Confidence | Reason |
|---|---|---|---|
| C1 | W− (less water): SME rises vs B. | high | Higher melt viscosity, more torque per kg. Seen in case 03 (216 → 253 W/kg as water fell). |
| C2 | W−: material temperature (Mat. 1) rises vs B. | high | More viscous dissipation. |
| C3 | W−: die pressure rises vs B. | medium | Higher viscosity at the same flow. Can be offset by the higher temperature. |
| C4 | N+ (faster screws): motor load (%) falls vs B. | medium | Lower fill at the same feed. |
| C5 | N+: SME rises vs B. | medium | More shear energy per kg at the same feed. |
| C6 | F+ (more feed): motor load rises vs B, and SME falls. | medium | More filled screw; energy spread over more mass. |
| C7 | Protein on dry basis of the piece is **not higher** than that of the WPI lot, and at most 3 points lower. | medium | Extrusion does not add nitrogen. Case 03 showed a small drop after extrusion, whose cause (analysis or process) we do not know. |
| C8 | Expansion index: direction for W−, W+, N+, T+. | **NO PREDICTION (INSUFFICIENT_DATA)** | Our three published cases showed that our reasoning fails on protein–water behaviour (6 of 9 misses there). Pure WPI has no starch to carry expansion. We have no basis to call the direction. |
| C9 | Bulk density: direction for any run. | **NO PREDICTION (INSUFFICIENT_DATA)** | Same reason as C8. |
| C10 | T+: expansion and colour. | **NO PREDICTION** | The one clear lesson of case 03 is that above about 95 °C melt, solubility no longer changed with temperature. Whether expansion follows is unknown. |
| C11 | B2 repeats B: process means within the scoring rule of B. | medium | Same settings. A failure here means the line drifts (raw material, wear, temperature of incoming water), and every other comparison in the trial must be read with that in mind. |

## What the trial can teach us

- C1–C6 and C11 test whether we read our own machine correctly.
- C7 tests the protein claim of the product ("87 % from WPI 90") against the raw material.
- C8–C10 are deliberately left open. The trial produces the first real data on how
  pure WPI expands on our line. That data is what the published literature could not
  give us.

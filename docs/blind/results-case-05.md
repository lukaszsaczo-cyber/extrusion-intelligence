# Unsealing and scoring case 05, 2026-09-26

Scored against Table 2 of Ribeiro et al., Foods 13(11):1748 (2024), after the seal
commit 4ad3364 (2026-09-26 18:40 UTC).

Table 2, one value per run (the table gives no replicates or significance letters):

| Run | Speed (rpm) | Torque (%) | Melt T (°C) | Melt P (bar) | SME (Wh/kg) |
|---|---|---|---|---|---|
| LT-LS | 300 | 11.2 | 115 | 18.0 | 41.1 |
| LT-MS | 350 | 12.3 | 117 | 20.4 | 52.6 |
| LT-HS | 400 | 9.2 | 115 | 14.3 | 44.9 |
| HT-LS | 300 | 10.4 | 131 | 16.5 | 38.1 |
| HT-MS | 350 | 9.8 | 130 | 15.5 | 41.9 |
| HT-HS | 400 | 7.9 | 130 | 11.6 | 38.7 |

Correction to inputs: the paper states a target moisture of 69 % (our 64.6 % was added
water only), L/D 24, six zones, cooling die at 80 °C.

| ID | Prediction | Paper | Score |
|---|---|---|---|
| S1 (= C4) | Faster screws → lower torque, both profiles | HT: 10.4 → 9.8 → 7.9 (falls). LT: 11.2 → 12.3 → 9.2 (up, then down) | **MISS** (holds in HT only) |
| S2 (= C5) | Faster screws → higher SME, both profiles | LT 41.1 → 52.6 → 44.9; HT 38.1 → 41.9 → 38.7: up, then down in both | **MISS** |
| S3 | Faster screws → hotter melt | LT 115 / 117 / 115; HT 131 / 130 / 130 | **MISS** (no change) |
| S4 | HT → hotter melt than LT | +16, +13, +15 °C at 300/350/400 rpm | **HIT** |
| S5 | HT → lower torque than LT | lower at all three speeds | **HIT** |
| S6 | HT → lower SME than LT | lower at all three speeds | **HIT** |
| S7 | Pressure: no prediction | Lower in HT at every speed; highest at 350 rpm in LT | not scored |
| S8 | Texture: no prediction | — | not scored |

Case 05: **3 HIT, 3 MISS.**

## Running total over five cases (four scored, case 04 pending the trial)

**18 HIT, 12 MISS** out of 30 scored claims.

## What this means for the chrupka trial (case 04)

1. **C4 and C5 carry the same wording as S1 and S2, and both missed here on the same
   extruder model.** Screw speed had a non-monotonic effect: 350 rpm gave the highest
   torque and SME in the low-temperature profile. The case-04 predictions stay sealed
   and unchanged. It is now on record that they may well fail.
2. **Barrel temperature behaved as expected** in all three process signals (S4–S6).
3. **Single values per run cannot separate a real effect from noise.** Examples: torque
   11.2 vs 12.3 %, melt temperature 115 vs 117 °C. That is why case 04 scores only against
   ±2 SD of a steady segment in the CSV, and repeats the baseline (B2).
4. **A consistency check for AUDIT 0.** In this table, SME follows torque × speed /
   feed exactly: 11.2 × 300 : 12.3 × 350 : 9.2 × 400 = 1 : 1.28 : 1.10, and
   41.1 : 52.6 : 44.9 = 1 : 1.28 : 1.09. On our CSV the same check can show whether the
   SME signal of the HMI is computed from the signals we have or from something else.
   It is a check to run, not a finding yet.

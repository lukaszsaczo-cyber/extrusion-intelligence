# Case 05: soy protein on a Clextral Evolum 25, screw speed × barrel temperature

Status: **SEALED** (predictions frozen 2026-09-26, results not opened).

Source: G. Ribeiro, M.-Y. Piñero, F. Parle, B. Blanco, L. Roman, "Optimizing Screw Speed
and Barrel Temperature for Textural and Nutritional Improvement of Soy-Based
High-Moisture Extrudates", Foods 13(11):1748 (2024),
https://www.mdpi.com/2304-8158/13/11/1748/pdf (read as PDF so that no abstract came
with the page metadata).

Purpose: test the process predictions sealed for our chrupka (case 04, C4 and C5,
unchanged wording) on published data from the **same extruder model**. It is a test of
our reading of the machine, not of the product.

## Inputs (as extracted)

| Item | Value |
|---|---|
| Extruder | Clextral Evolum 25, co-rotating twin-screw |
| Raw material | SPI (ProFam 974) and SPC (Arcon SM) at 1:9, about 77 % protein |
| Solids feed | 2.8 kg/h |
| Water | 5.1 L/h |
| Die | cooling die 450 × 30 × 4 mm |
| Barrel, LT profile | 30, 50, 75, 105, 115, 120 °C |
| Barrel, HT profile | 30, 70, 95, 115, 125, 140 °C |
| Screw speed | 300 (LS), 350 (MS), 400 (HS) rpm |
| Runs | LT-LS, LT-MS, LT-HS, HT-LS, HT-MS, HT-HS |
| Process responses | SME, torque, melt temperature, melt pressure |
| Product responses | texture profile analysis, cutting test |

Computed from inputs (no result used): added water share = 5.1 / (2.8 + 5.1) = **64.6 %**,
so this is high-moisture extrusion, very different from a puffed piece.

## Predictions (frozen)

Scoring: we use the paper's own significance letters where given. Where it gives only
means, a direction counts if all relevant means move the same way.

| ID | Prediction | Confidence | Reason |
|---|---|---|---|
| S1 (= C4) | Higher screw speed → lower torque, in both profiles. | medium | Lower fill at the same feed. |
| S2 (= C5) | Higher screw speed → higher SME, in both profiles. | medium | More shear energy per kg at the same feed. |
| S3 | Higher screw speed → higher melt temperature. | medium | More viscous dissipation. |
| S4 | HT profile → higher melt temperature than LT at the same speed. | high | 20 °C hotter end zones. |
| S5 | HT profile → lower torque than LT at the same speed. | medium | Lower melt viscosity at higher temperature. |
| S6 | HT profile → lower SME than LT at the same speed. | medium | Follows S5 (SME is proportional to torque × speed / feed). |
| S7 | Effect of speed and temperature on melt pressure. | **NO PREDICTION (INSUFFICIENT_DATA)** | Pressure at a long cooling die depends on how the protein sets in the die. Our reasoning is weakest exactly here. |
| S8 | Effect on texture (TPA, cutting). | **NO PREDICTION (INSUFFICIENT_DATA)** | Protein–water behaviour; see the misses in cases 01–03. |

Internal consistency note, written before unsealing: S1 and S2 are only compatible if
torque falls **less** than speed rises in proportion (SME ∝ torque × N / feed). A 33 %
speed step (300 → 400) must reduce torque by less than 25 % for S2 to hold.

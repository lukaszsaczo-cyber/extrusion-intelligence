# Unsealing and scoring case 03, 2026-09-26

Scored against chapter 6.5 of the dissertation after the seal commit b123ba2
(2026-09-26 18:27 UTC).

| ID | Prediction | Paper (section 6.5, tables 6-1 to 6-4, fig. 6-1) | Score |
|---|---|---|---|
| R1 | SME: E116 > E105 > E95 | "SME (W/kg) for E95, E105, and E116 were 216, 238, and 253" (unit as printed) | **HIT** |
| R2 | Solubility at pH 6.8: extruded < control | "Extrusion reduced MPC80's solubility at each pH tested"; about 9–10 % vs 28 % | **HIT** |
| R3 | Solubility at pH 6.8 falls with melt temperature | "Higher SME and melt temperature did not affect extrudate solubility at any pH", except pH 9.5 | **MISS** |
| R4 | Lowest solubility near pH 4.6 | Minimum at pH 4.5–4.6: control 14–15 %, extruded about 3 % | **HIT** |
| R5 | Free SH of powders: extruded < control | Table 6-3: control 5.2–6.0; extruded 1.4–2.9 µmol/g | **HIT** |
| R6 | Free amine of powders: extruded < control | Table 6-4: 877 vs 775 / 748 / 695 µmol/g; lower still at higher melt temperature | **HIT** |
| R7 | Occluded air lower, particle density higher after extrusion | Table 6-1: Voa 17.8 → about 3.3 mL/100 g; ρparticle 1.11 → about 1.32 g/cm³ | **HIT** |
| R8 | Bars: free amine falls with time, faster at 32 °C | Control bar: 828 → 615 (6 wk, 22 °C) vs 380 (6 wk, 32 °C) | **HIT** |
| R9 | Bars: free SH falls with storage | Unchanged for control and E116; fell only for E105; rose for all after 29 wk at 32 °C | **MISS** |
| R10 | Contact angle: no prediction | Extruded powders started higher (85–90° vs 66°) and fell faster | not scored |
| R11 | SDS-PAGE: no prediction | — | not scored |
| R12 | WHC: excluded | Extrusion lowered WHC by 42 % (the direction the methods had revealed) | excluded |

Case 03: **7 HIT, 2 MISS.**

## Running total over three cases

**15 HIT, 9 MISS** out of 24 scored claims, plus 6 honest "no prediction" or excluded
answers.

The misses in case 03 follow the same pattern as cases 01 and 02: we assumed "more
heat, more effect" in a finer step than the protein shows. Two examples:
- raising the melt from 95 to 116 °C did not change solubility, because denaturation
  was already complete at 95 °C;
- disulfide changes during storage did not simply go one way.

## What this case says that is relevant to a high-protein dairy product

These statements are from the paper; they are not our conclusions about our line.
- Extruding a milk protein concentrate with water alone (28.6–34.2 % added water, melt
  95–116 °C) strongly and irreversibly lowers protein solubility, water holding and
  free SH. The effect was already full at a 95 °C melt.
- Melt temperature did matter for available lysine: free amine fell step by step from
  95 to 116 °C. Hotter costs nutrition without further changing solubility.
- The extruded protein hydrated faster once wetted (contact angle fell faster).

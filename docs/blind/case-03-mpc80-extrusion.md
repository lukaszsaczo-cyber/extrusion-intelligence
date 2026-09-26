# Case 03: extrusion of pure MPC80 at three melt temperatures

Status: **SEALED** (predictions frozen 2026-09-26, results not opened).

Source: J. C. Banach, "Modified milk protein concentrates in high-protein nutrition bars",
PhD dissertation, Iowa State University, chapter 6 ("Extrusion-modified physicochemical
properties of milk protein …"),
https://dr.lib.iastate.edu/server/api/core/bitstreams/6f6eec60-ca27-44e8-949b-1ca64b342ac7/content

Why this case: 100 % milk protein concentrate (78.5 % protein) extruded with water only,
the closest published case we found to a high-protein dairy product. Rules as in
[PROTOCOL.md](PROTOCOL.md).

## Inputs (read by us from sections 4.4.1 and 6.4.1–6.4.10 only)

| Item | Value |
|---|---|
| Material | MPC80, Milk Specialties Global: 78.5 % protein, 4.3 % fat, 6.7 % ash, 4.9 % moisture, 5.6 % lactose |
| Extruder | Bühler DNDL 44, co-rotating twin-screw (L/D 28 per case 01, same pilot plant) |
| Feed | 25 kg/h |
| Screw speed | 350 rpm |
| Barrel | set at 50 °C |
| Die | circular, 3 mm |
| Water | 13, 11 or 10 kg/h, giving die-end melt temperatures of about 95, 105 and 116 °C (E95, E105, E116) |
| After extrusion | pelletised, fluid-bed partial drying, then 26 h at 40 °C, coarse grinding, jet milling |
| Uses | E105, E116 and control MPC80 as the sole protein in bars at 30 % protein, stored at 22 or 32 °C for 0, 6 or 29 weeks |
| Responses | SME; particle size; loose, tapped and particle density; occluded and interstitial air; solubility at pH 2.0–11.0; WHC; dynamic contact angle; free sulfhydryl (powders and bars); SDS-PAGE; free amine (powders and bars) |

Computed from inputs (no result used): added water share = water / (25 + water) =
**34.2 %** (E95), **30.6 %** (E105), **28.6 %** (E116).

## Contamination (seen while reading the methods)

- The powders' protein and moisture after extrusion are given in the methods: E95 74.0 %
  protein, 7.6 % moisture; E105 74.3 %, 7.5 %; E116 74.4 %, 7.4 %. These are not predicted.
- The WHC method uses more powder and less water for the extruded powders than for the
  control, "based on preliminary WHC estimates". That reveals the direction of WHC.
  **WHC is excluded from the predictions.**

## Predictions (frozen)

| ID | Prediction | Confidence | Reason |
|---|---|---|---|
| R1 | SME rises as water falls: E116 > E105 > E95. | high | Less water, higher melt viscosity, more torque. |
| R2 | Solubility at pH 6.8: every extruded powder < control MPC80. | high | Heat and shear denature and aggregate whey proteins and casein. |
| R3 | Among extruded powders, solubility at pH 6.8 falls with melt temperature: E116 < E105 < E95. | medium | More heat, more aggregation. The steps are only about 10 °C. |
| R4 | For all powders, solubility is lowest near pH 4.6. | high | Isoelectric point of casein. |
| R5 | Free sulfhydryl of the powders: extruded < control. | medium | Unfolding exposes SH groups, which then form disulfide bonds in the melt. |
| R6 | Free amine of the powders: extruded < control. | low | Maillard reaction with 5.6 % lactose consumes lysine. The melt time is short. |
| R7 | Occluded air: extruded < control; particle density: extruded > control. | medium | Spray-dried particles hold vacuoles; extrusion and jet milling destroy them. |
| R8 | Bars: free amine falls with storage time, faster at 32 °C than at 22 °C. | high | Maillard reaction during storage. |
| R9 | Bars: free sulfhydryl falls with storage time. | medium | Slow disulfide formation during storage. |
| R10 | Contact angle of extruded vs control powders. | **NO PREDICTION (INSUFFICIENT_DATA)** | Aggregation can expose hydrophobic groups (higher angle), but loss of vacuoles and milling change the surface too. |
| R11 | SDS-PAGE patterns. | **NO PREDICTION** | Qualitative; no clear directional claim can be scored. |
| R12 | WHC. | **EXCLUDED** (contaminated) | See above. |

## Transfer to our line (not scored)

The water shares above (28.6–34.2 %) are close to what our screens show (about 28–29 %
added water, if the feeder display is the dry feed rate). Differences: their barrel is
at 50 °C and melt reaches 95–116 °C through mechanical energy alone; our barrel profile
ends at 93–95 °C and melt shows 97–100 °C. Their goal was a milled ingredient, not a
puffed piece. This case can teach us how temperature changes the protein. It cannot
tell us how the piece expands.

# Case 01: twin-screw puffing of non-fat dry milk (NDM)

Status: **SEALED** (predictions frozen 2026-09-26, results not opened).

Source: T. Schoenfuss, A. Tremaine, K. Evenson, M. Maher, "Twin-screw extrusion puffing
of non-fat dry milk powder", AURI report,
https://www.auri.org/wp-content/uploads/2013/11/2009103.Schoenfuss.pdf

## Inputs (as extracted)

| Item | Value |
|---|---|
| Extruder | Bühler 44 mm co-rotating twin-screw, DNDL 44, L/D 28 |
| Screw configuration | not extracted |
| Die | not extracted (the reader returned the extruder name in this field) |
| Feed rate | 40 kg/h |
| Screw speed | 350 rpm |
| Barrel temperature | 40, 40, 80, 80 °C |
| Water | 6.5 or 7.3 kg/h; lactic acid added to the water |
| Raw materials | Grade A low-heat NDM, Clearjel S, "Elaine 100", potato starch, 88–92 % liquid lactic acid |
| Design | NDM 45, 65, 85 %; water 6.5, 7.3 kg/h; lactic acid 0, 33, 50 % of the added water |
| Cutting and drying | 5 cm lengths; 10 min at 100 °C, fluidized bed, screened trays |
| Responses | browning (absorbance 420 nm), WAI, WSI, RVA peak viscosity |

To check when unsealing: the starch blend (which starches, in which proportion) is not
given in the extraction; the die geometry is missing.

Computed from inputs (no result used): added water share of the total feed
= water / (40 + water) = 6.5 / 46.5 = **14.0 %** and 7.3 / 47.3 = **15.4 %**
(the moisture of the powders themselves is not known, so total moisture is higher).

## Predictions (frozen)

| ID | Prediction | Confidence | Reason |
|---|---|---|---|
| P1 | Browning (A420) rises with NDM level: 85 % > 65 % > 45 %. | high | More lactose and lysine-rich protein, so more Maillard reaction. |
| P2 | Lactic acid lowers browning: 0 % acid > 33 % > 50 %. | medium | Maillard reaction slows at lower pH. |
| P3 | More water (7.3 kg/h) gives less browning than 6.5 kg/h. | low | More water, less viscous dissipation, lower melt temperature. Small effect expected at a 0.8 kg/h step. |
| P4 | WSI rises with NDM level. | high | Lactose is soluble; less starch matrix. |
| P5 | WAI falls with NDM level. | medium | Less gelatinised starch to take up water. |
| P6 | RVA peak viscosity falls with NDM level. | medium | Less starch in the sample. |
| P7 | Effect of lactic acid on WAI and WSI. | **NO PREDICTION (INSUFFICIENT_DATA)** | Acid brings casein towards its isoelectric point (lower solubility) but can also hydrolyse starch (higher solubility). The inputs do not say which dominates. |
| P8 | Effect of water level on WAI, WSI and RVA. | **NO PREDICTION (INSUFFICIENT_DATA)** | The step is small and the direction depends on the starch type, which is not known. |

## Transfer to our extruder (plan, not scored)

Not transferable without new inputs. The paper's barrel profile tops out at 80 °C at L/D
28, so puffing relies on mechanical energy. Our screens show SME around 95–105 Wh/kg on
the current product. To run this on our machine we would need the starch blend, the die,
and the specific mechanical energy the paper reached.

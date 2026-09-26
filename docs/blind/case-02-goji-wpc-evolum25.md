# Case 02: rice extrudates with goji powder and WPC 80 on a Clextral Evolum 25

Status: **SEALED** (predictions frozen 2026-09-26, results not opened).

Source: T. Ménabréaz, M. Dorsaz, D. Bocquel, I. Udrisard, A. Kosińska-Cagnazzo,
W. Andlauer, "Goji Berry and Whey Protein Concentrate Enriched Rice Extrudates –
Physical Properties and Accessibility of Bioactives", Pol. J. Food Nutr. Sci. (2021),
https://journal.pan.olsztyn.pl/pdf-131269-61994?filename=61994.pdf

## Inputs (as extracted)

| Item | Value |
|---|---|
| Extruder | Clextral Evolum 25, twin-screw; K-Tron powder feeder |
| Screw configuration | "high shear configuration" (elements not extracted) |
| Barrel temperature | 20, 40, 60, 80, 100, 140 °C |
| Die | round, 2 mm |
| Feed rate | 13 kg/h |
| Water | 1.4 L/h |
| Screw speed | 400 rpm |
| Base | rice flour (La Riseria Taverne SA) 99.5 % + salt 0.5 % |
| Goji | powder, replacing rice flour at 3, 7, 10, 13, 17, 20 % |
| WPC | LEDOR MO 80T (Hochdorf), added at 2, 4, 7 % to the 20 % goji mix |
| Mixing | powder mixer, 30 s |
| Drying | oven 120 °C, 10 min, target moisture < 5 % |
| Responses | expansion ratio (calliper), colour (Minolta CM-5), hardness (TA-XT), bulk density (Ottawa cell), in vitro digestion, AA-2βG and rutin (HPLC) |

To check when unsealing:
- the extraction says 5 zones but lists 6 temperatures;
- the rice share for 3 % goji came out as 96 % (99.5 − 3 = 96.5);
- whether WPC replaced rice flour or was added on top.

Computed from inputs (no result used): added water share = 1.4 / (13 + 1.4) =
**9.7 %** of the total feed (plus the unknown moisture of the flour and goji powder).

## Predictions (frozen)

Series G = goji 0 → 20 % without WPC. Series W = 20 % goji with WPC 0 → 7 %.

| ID | Prediction | Confidence | Reason |
|---|---|---|---|
| Q1 | Expansion ratio falls with goji: ER(20 %) < ER(0 %); the overall trend over G is downward. | high | Sugars and fibre dilute and plasticise the starch; less elastic melt, earlier collapse. |
| Q2 | Bulk density rises with goji: BD(20 %) > BD(0 %). | high | Follows Q1. |
| Q3 | Hardness rises with goji: H(20 %) > H(0 %). | medium | Denser, thicker cell walls. Sugars can also make a glassy, brittle matrix, so the trend may not be monotonic. |
| Q4 | Colour over G: L* falls, a* rises. | high | Red-orange carotenoids of goji plus Maillard reaction from its sugars. |
| Q5 | WPC in series W does not raise expansion: ER(20 % goji + 7 % WPC) ≤ ER(20 % goji). | medium | Protein competes for water and interrupts the starch network. At ≤ 7 % the effect may be small. |
| Q6 | WPC darkens the product: L*(7 % WPC) < L*(0 % WPC) in series W. | medium | Lysine from WPC plus goji reducing sugars at a 140 °C end zone gives more Maillard reaction. |
| Q7 | Bulk density in series W rises with WPC. | low | Follows Q5. The effect may be within the noise. |
| Q8 | Effect of WPC on the in vitro accessibility of AA-2βG and rutin. | **NO PREDICTION (INSUFFICIENT_DATA)** | Protein can bind polyphenols (lower accessibility) or protect them (higher). The inputs do not decide it. |
| Q9 | Retention of AA-2βG and rutin after extrusion is below the level in the raw mix. | medium | Heat and shear at a 140 °C end zone. Only testable if the paper reports raw-mix values. |

## Transfer to our extruder (plan, not scored)

If our machine is the same size (Evolum 25, to be confirmed from the nameplate), the
direct transfer is the paper's own settings: 13 kg/h, 400 rpm, 1.4 L/h water, 2 mm round
die, end zone 140 °C, and a high-shear screw. Differences to check first:
- our current run on the screens is at a much higher throughput (about 77–80 kg/h feeder
  display) and lower speed (242–252 rpm), so the screw is much more filled;
- our screw configuration is unknown to us;
- our barrel end zone shows about 93–95 °C, not 140 °C.

Nothing here is a recommendation to change the machine. It is the list of differences
that would have to be closed before a replication run on our line could be compared with
the paper.

# Process rules tested on published data (2026-09-26)

The process rules were sealed before these papers were searched: C1–C6 in commit 7204dd4
(case 04) and S3–S6 in commit 4ad3364 (case 05). They are applied here unchanged, so
the result could not shape them. Papers were chosen only by one criterion: an open table
of process data. Their outcomes did not play a part in the choice.

| Rule | Change | Predicted |
|---|---|---|
| W | less water | SME ↑ (C1), melt temperature ↑ (C2), die pressure ↑ (C3) |
| N | faster screws | torque ↓ (C4), SME ↑ (C5), melt temperature ↑ (S3) |
| F | more feed | torque ↑, SME ↓ (C6) |
| T | hotter barrel | melt temperature ↑ (S4), torque ↓ (S5), SME ↓ (S6) |

Scoring: a rule holds only if **every** step in the series moves in the predicted
direction.

## Case 06: whole-grain sorghum, Bühler BTSK-30

Source: "Reduction of Alternaria Toxins via the Extrusion Processing of Whole-Grain Red
Sorghum Flour", Foods 13(2):255 (2024), Table 4.

Inputs: Bühler BTSK-30, L/D 28, 50 kg/h dry feed, barrel 80/120 °C, 4 mm die. Full
factorial: moisture 12/15/18 % × screw speed 400/600/800 rpm. Values were read from the
extruder's control screen.

| M % | rpm | Die T °C | P | SME | Torque |
|---|---|---|---|---|---|
| 18 | 400 / 600 / 800 | 136 / 144 / 153 | 2.65 / 1.25 / 0.16 | 83.5 / 99.6 / 112 | 114 / 88.0 / 99.0 |
| 15 | 400 / 600 / 800 | 159 / 165 / 166 | 4.03 / 1.78 / 1.28 | 104 / 117 / 130 | 134 / 99.0 / 114 |
| 12 | 400 / 600 / 800 | 168 / 176 / 177 | 6.23 / 4.81 / 3.04 | 132 / 140 / 152 | 163 / 117 / 123 |

| Rule | Evidence | Score |
|---|---|---|
| C1 W → SME ↑ | 18 → 15 → 12 %: rises at every speed | **HIT** |
| C2 W → melt T ↑ | rises at every speed | **HIT** |
| C3 W → pressure ↑ | rises at every speed | **HIT** |
| C4 N → torque ↓ | falls 400 → 600, **rises** 600 → 800 at every moisture | **MISS** |
| C5 N → SME ↑ | rises at every moisture | **HIT** |
| S3 N → melt T ↑ | rises at every moisture | **HIT** |

Case 06: **5 HIT, 1 MISS.**

## Case 07: faba bean protein TVP, APV MPF19

Source: "Effect of Extrusion Conditions on the Characteristics of Texturized Vegetable
Protein from a Faba Bean Protein Mix …", Foods 14(4):547 (2025), Tables 1 and 2.

Inputs: APV Baker MPF19, L/D 25, 2.75 kg/h dry feed, 2.3 mm die, faba protein mix
82.8 % protein (d.b.). One factor at a time around T2 (35 % moisture, 300 rpm, die
125 °C). Three extrusion runs per treatment; significance letters given. Melt
temperature was not reported.

| Series | Torque % | SME Wh/kg | Die pressure kPa |
|---|---|---|---|
| Speed 200 / 300 / 400 rpm (T1, T2, T3) | 56.9a / 28.8c / 25.2d | 118.4a / 89.9c / 105.1b | 3234.7d / 3558.1d / 3962.5c |
| Moisture 40 / 35 / 30 % (T5, T2, T4) | 25.0d / 28.8c / 32.5b | 72.0d / 89.9c / 109.2b | 2163.2f / 3558.1d / 5337.2b |
| Die temperature 110 / 125 / 140 °C (T7, T2, T6) | 33.6b / 28.8c / 23.3d | 104.8b / 89.9c / 72.8d | 5761.8a / 3558.1d / 2628.2e |

| Rule | Evidence | Score |
|---|---|---|
| C1 W → SME ↑ | 72.0 → 89.9 → 109.2, all significant | **HIT** |
| C2 W → melt T ↑ | not reported | not testable |
| C3 W → pressure ↑ | 2163 → 3558 → 5337 kPa | **HIT** |
| C4 N → torque ↓ | 56.9 → 28.8 → 25.2 | **HIT** |
| C5 N → SME ↑ | 118.4 → 89.9 → 105.1 (down, then up; significant) | **MISS** |
| S4 T → melt T ↑ | not reported | not testable |
| S5 T → torque ↓ | 33.6 → 28.8 → 23.3 | **HIT** |
| S6 T → SME ↓ | 104.8 → 89.9 → 72.8 | **HIT** |

Case 07: **5 HIT, 1 MISS.**

## Checked but not usable

- Processes 12(6):1159 (wheat flour with xylanase): screw speed and moisture change
  together in its runs, and the automated table reading gave impossible values. Not used.
- Foods 12(20):3830 (high-moisture meat analogues): no process table in the text. Its
  search snippet stated a feed-rate effect; the paper was not used.
- Foods 15(12):2118: a review, with no own data.

## Scoreboard of the process rules (cases 05, 06, 07)

| Rule | Hits / tested | Verdict |
|---|---|---|
| W → SME ↑ (C1) | 2 / 2 | works |
| W → melt T ↑ (C2) | 1 / 1 | works, little evidence |
| W → pressure ↑ (C3) | 2 / 2 | works |
| T → melt T ↑ (S4) | 1 / 1 | works, little evidence |
| T → torque ↓ (S5) | 2 / 2 | works |
| T → SME ↓ (S6) | 2 / 2 | works |
| N → torque ↓ (C4) | 1 / 3 | **does not work as a rule** |
| N → SME ↑ (C5) | 1 / 3 | **does not work as a rule** |
| N → melt T ↑ (S3) | 1 / 2 | undecided |
| F → torque ↑, SME ↓ (C6) | 0 / 0 | not tested: no paper found |

**Water and barrel temperature: 10 of 10.** Screw speed: 3 of 8. In all three papers the
speed series was non-monotonic in torque or SME, although the step size and the
machines differed (Evolum 25, Bühler BTSK-30, APV MPF19). Torque typically falls from the
lowest speed and then levels off or rises again.

Totals, all cases so far:
- process rules (cases 05–07): **13 HIT, 5 MISS**;
- product and protein predictions (cases 01–03): **15 HIT, 9 MISS**;
- overall: **28 HIT, 14 MISS** out of 42.

Consequence for the chrupka trial (case 04): C1–C3 now have independent support. C4 and
C5 are expected to be the weakest predictions. They stay sealed and unchanged.

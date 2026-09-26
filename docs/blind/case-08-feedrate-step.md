# Case 08: step change in feed rate (Akdogan & Rumsey 1996, as cited in a USDA ARS review)

Status: **SEALED** (predictions frozen 2026-09-26, response not opened).

Source: Akdogan, H. & Rumsey, T.R. (1996), dynamic response of a twin-screw food
extruder to step changes in feed rate, as described in the USDA ARS review "High
moisture food extrusion", https://www.ars.usda.gov/ARSUserFiles/30200525/Highmoisturefoodextrusion272A.pdf
(the review's own figure/caption, not the original 1996 paper).

Purpose: this is the first open test of the sealed chrupka rule **C6** ("more feed →
higher torque, lower SME") and its implicit counterpart for a feed-rate **decrease**.
C6 itself stays sealed and unchanged in case 04; this case only checks whether the same
direction shows up in an independent, real step-change trial.

## Inputs (as extracted, blind)

| Item | Value |
|---|---|
| Citation | Akdogan & Rumsey, 1996 |
| Extruder | twin-screw |
| Screw speed | held constant at 175 rpm |
| Barrel temperature | 80 °C |
| Moisture | 60 % |
| Feed rate step | 3.8 → 4.5 kg/h, and the reverse, 4.5 → 3.8 kg/h |
| Measured | die pressure, motor torque, over time (dynamic/step response) |

This is a **step-response** trial (time-domain), not a steady-state comparison of levels.
The figure shows how pressure and torque move right after the step and where they settle.

## Predictions (frozen)

| ID | Prediction | Confidence | Reason |
|---|---|---|---|
| U1 | Step up (3.8 → 4.5 kg/h): torque settles higher than before the step. | medium | Same direction as C6 (more feed → higher torque): fuller screw channel, more resisting material per revolution. |
| U2 | Step up: die pressure settles higher than before the step. | medium | More material forced through the same die opening per unit time. |
| U3 | Step down (4.5 → 3.8 kg/h): torque and pressure settle lower than before the step, mirroring U1/U2. | medium | Simple reversibility, if the extruder has no strong hysteresis. |
| U4 | Both responses are **not instantaneous**: torque and pressure move gradually over some seconds, not as a vertical jump, because material must physically fill/empty the barrel before a new steady state. | high | Basic mass-transport lag; true of any real extruder regardless of direction assumptions. |
| U5 | Magnitude of the response (how much torque/pressure change per kg/h of feed change). | **NO PREDICTION (INSUFFICIENT_DATA)** | We have no calibration for the gain of this specific extruder at this operating point. |

## Note on relation to C6

C6 predicts direction only ("higher feed → higher torque, lower SME"); it does not
predict the dynamic path. U1–U3 test the **steady-state direction** implied by C6 using
an independent extruder and an independent step-response design — the strongest kind of
external check available before our own trial.

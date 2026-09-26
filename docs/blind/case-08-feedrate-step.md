# Case 08: step change in feed rate (Akdogan & Rumsey 1996, as cited in a USDA ARS review)

Status: **SEALED, UNRESOLVED.** Predictions frozen 2026-09-26 (commit 3bfb83e). The
response was searched for afterwards but could not be read from text.

Source: Akdogan, H. & Rumsey, T.R. (1996), dynamic response of a twin-screw food
extruder to step changes in feed rate, as described in the USDA ARS review "High
moisture food extrusion", https://www.ars.usda.gov/ARSUserFiles/30200525/Highmoisturefoodextrusion272A.pdf

## Why this case cannot be scored

The review states the experiment (3.8 -> 4.5 kg/h and the reverse, screw speed constant
at 175 rpm) and shows the response only as **Figure 1**, a plot we cannot read from
extracted text. The review's own prose describes only that "die pressure and motor
torque were found to respond in the same manner" (i.e., together, not in opposite
directions) and that the step was fit with a first-order transfer function. It does not
say in words whether pressure/torque went up or down when feed rate increased. A
separate figure (Fig. 2, screw speed step) *is* described in prose, and that passage was
read (see case 05/07 process-rule scoreboard; it is consistent with an inverse/overshoot
response, not simple monotonic torque decrease with speed).

**Verdict: U1-U3 stay open.** Not a hit, not a miss. We do not have a text-based
resolution and did not want to guess from an unreadable figure.

## Predictions (unchanged, as originally sealed)

| ID | Prediction | Status |
|---|---|---|
| U1 | Step up (3.8 -> 4.5 kg/h): torque settles higher. | unresolved |
| U2 | Step up: die pressure settles higher. | unresolved |
| U3 | Step down: torque and pressure settle lower, mirroring U1/U2. | unresolved |
| U4 | Response is gradual, not instantaneous. | unresolved (plausible on general grounds, not confirmed from this source) |
| U5 | Magnitude of the response. | no prediction, as sealed |

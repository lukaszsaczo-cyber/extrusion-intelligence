# SME consistency check on our panel readings (2026-09-26)

Data: the two HMI states read from the R3 photos ([machine-r3.md](machine-r3.md)). This is
eye-read data, not a CSV. The test is deterministic arithmetic: the predicted value is
computed from the other displays before it is compared with the SME shown.

## Test

If the panel computes SME = k × torque % × screw speed / mass flow, then k must be the
same in both states, and the SME ratio between the states must equal the ratio of
torque × speed / flow.

| State | Torque % | rpm | Feeder kg/h | Water kg/h | SME shown | t·n/feed | k (feed only) | k (feed + water) |
|---|---|---|---|---|---|---|---|---|
| P1 (14:37) | 58 | 242 | 77.0 | 31.2 | 95.05 | 182.29 | 0.5214 | 0.7327 |
| P2 (09:29) | 64 | 252 | 80.0 | 31.1 | 104.98 | 201.60 | 0.5207 | 0.7232 |

| Ratio P2 / P1 | Value | Difference from shown |
|---|---|---|
| SME shown | 1.1045 | — |
| computed, flow = feeder only | 1.1060 | +0.13 % |
| computed, flow = feeder + water | 1.1191 | +1.32 % |
| possible range from display rounding (feeder only) | 1.0822 – 1.1303 | — |
| possible range from display rounding (feeder + water) | 1.0944 – 1.1443 | — |

## Result

1. **Consistent.** The panel SME behaves as torque × speed / flow: k stays constant to
   within 0.13 % between two states taken five hours apart.
2. **Feeder only fits better** (0.13 % vs 1.32 %), but both hypotheses lie within the
   rounding of the displays. Two points cannot decide it. The CSV, with many points and
   full resolution, can.
3. **Machine size does not match the published Evolum 25.** Ribeiro et al. (2024) state
   that their Evolum 25 works "at a maximum solid feeding of 25 kg/h and a maximum liquid
   feeding of 40 l/h", with six barrel zones and L/D 24. Our panel shows:
   - a feeder display of 77–80 kg/h;
   - five barrel zones;
   - an implied full-scale torque of about 498 N·m, if torque % refers to the motor and
     the feeder reads dry kg/h. The same formula gives about 33 N·m from the paper's
     table.

   Two explanations fit the facts: our extruder is **larger than an Evolum 25**, or the
   feeder display is **not dry feed in kg/h**. Which one is true must come from the
   nameplate and the Fitsys+ tag list. It is not decided here.

## Consequence

- The model ("25") stays unconfirmed. The comparison of our line with the Evolum 25
  papers (cases 02 and 05) is valid for the direction of effects only, not for
  magnitudes.
- AUDIT 0 on the real CSV gets two concrete checks:
  - recompute SME from torque, speed and each flow hypothesis, and keep the one that
    matches at full resolution;
  - confirm the unit of the feeder signal.

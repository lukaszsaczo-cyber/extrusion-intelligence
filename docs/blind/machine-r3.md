# Our machine, as read from photos (album "R3", sent 2026-09-26)

These values are read by eye from phone photos of the HMI screens. They are **not** a
data export and are not used as evidence anywhere. Digits that could not be read with
certainty are marked "?". The model is **not confirmed**: the barrel carries "EVOLUM",
the HMI is Clextral with a Pro-face panel, and the owner believes it is the 25 model.
Confirm from the nameplate.

## Main line screen (two photos)

| Display | Photo 1 (14/07/26 14:37) | Photo 2 (14/07/26 09:29) | Unit |
|---|---|---|---|
| Barrel zones 5 / 4 / 3 / 2 / 1, measured | 93 / 85 / 70 / 60 / 27 | 95 / 85 / 71 / 60 / 27 | °C |
| Barrel zones 5 / 4 / 3 / 2 / 1, setpoint | 93 / 85 / 70 / 60 / 50 | 95 / 85 / 70 / 60 / 50 | °C |
| Heating/cooling unit, measured | 11 | 10 | °C |
| Water pump (32) | 31.2 | 31.1 | kg/h |
| Dosing feeder display | 77.0 | 80.0 | kg/h |
| Feeder hopper weight | 14.0 | 16.7 | kg |
| Feeder percentage display | 29.6 | 31.2 | % |
| Screw speed | 242 | 252 | rpm |
| Motor load | 58 | 64 | % |
| Die pressure | 131 | 127 | bar |
| Material temperature ("Mat. 1") | 97 | 100 | °C |
| Cutter (34) | 4523 | 4511 | rpm |
| Unlabelled display near cutter | 40 | 40 | % |
| SME | 95.05 | 104.98 | Wh/kg |

Alarm list shown on the screens (as displayed):
- 14/07/26 06:58:36: "0901-OGOLNE: Blad wentylatora szafy" (cabinet fan fault);
- 14/07/26 12:26:29: "3409 - NOZ: Srodek 1 silnik wariatora predkosci (jednostka)" (cutter variator motor);
- 14/07/26 14:11:01: "31-106 - DANNA BRABENDER: 04H Przeciazenie" (the digits may be misread; Brabender feeder overload);
- 14/07/26 08:41:49: the same cutter variator message.

## Dryer screen

AUTO mode, "Stabilizowany", heating PID 025, setpoint 110 °C, measured 109 °C; belt
("TAŚMA") setpoint 15.00 min, speed 027 %, range 4.00–25.00; circulation setpoint 055 %,
speed 055 %.

## What this does and does not tell us

- It shows one steady state per photo. It is not a run log, has no sampling rate and
  cannot replace the Fitsys+ CSV for AUDIT 0.
- Computed from the displays (no assumption about the powder): water / (feeder + water) =
  31.2 / (77.0 + 31.2) = **28.8 %** added water in photo 1, 31.1 / (80.0 + 31.1) = **28.0 %**
  in photo 2. This holds only if the feeder display is the dry feed rate in kg/h. That is
  not confirmed.
- SME differs by about 10 % between the two photos at almost the same settings. The
  photos alone cannot say why.

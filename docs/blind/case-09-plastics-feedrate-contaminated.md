# Case 09: feed rate vs. torque/SME on plastics twin-screw compounders — NOT a blind test

Status: **CONTAMINATED BY DESIGN, NOT SEALED.** This is disclosed as supporting evidence
only, never as a scored hit for the sealed chrupka rule C6.

## What happened

Searching for a text-based (not figure-only) description of the feed-rate effect on
torque/SME, a practical scale-up guide was fetched and read in full in one call:
Alan Swanborough (Thermo Fisher / PRISM), "A Practical Approach to Scale-up from
Bench-top Twin-screw Extruders", http://www.pinetwork.org/pubs/Alan%20Swanborough.pdf.
The whole document, including its own stated conclusions and its raw data tables, came
back in a single fetch before any prediction could be written down and sealed in git.
**No blind protocol was followed for this source.** It is logged here, not scored, and
not counted in any hit/miss total.

## What the document says (read, not predicted)

Material: a polymer (plastics compounding), not food. Twin-screw compounders,
16 mm and 24 mm, L/D 25-40:1.

The document's own conclusion 3, verbatim: "At a fixed screw speed, increasing feed-rate
will reduce product specific energy and temperature, because of reduced residence time."

Its own data table (TSE 24 HC, 40:1, two-stage, 400 rpm):

| Feed rate (kg/h) | 4 | 8 | 12 | 16 | 20 | 30 | 40 |
|---|---|---|---|---|---|---|---|
| Specific energy (kWh/kg) | 0.262 | 0.186 | 0.166 | 0.155 | 0.158 | - | 0.156 |
| Net power (kW), same table elsewhere | 1.30 | 1.80 | 2.25 | 2.70 | 3.40 | 3.40 | - |

At fixed screw speed, specific energy per kg falls as feed rate rises, while total net
power (proportional to torque at fixed rpm) rises. This is exactly the shape of the
sealed chrupka rule **C6** ("more feed -> higher torque, lower SME"): more material
processed per hour draws more total power (and so more torque), but each kilogram gets
less mechanical energy because it spends less time in the barrel.

## Why this does not count as a hit

1. It was read as one block, with its conclusions and data together, before any
   prediction was frozen. There was no seal to unseal.
2. It is a different material class (plastics, not a food or dairy melt); rheology
   differs.
3. It reports specific energy and net power, not torque directly, though torque follows
   from power at fixed screw speed.

## What it is worth

As **supporting, non-blind evidence**, it is a real, quantitative, independent case in
which "more feed, same speed -> higher power/torque, lower SME per kg" holds cleanly,
across a decade-wide feed-rate range and two extruder sizes. It raises our confidence in
C6's direction without letting it count as a validated hit. C6 stays sealed and unchanged
in case 04, to be judged only by the real trial on our line.

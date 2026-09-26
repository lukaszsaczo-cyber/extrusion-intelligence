# Blind replication protocol (frozen 2026-09-26)

Goal: test our reasoning on published extrusion experiments before we look at their
results. The published results are the reference; our predictions are hypotheses.

## Rules

1. **Inputs only.** From each paper we take only the inputs: machine, screw, die, raw
   materials, formulations, feed rate, water, screw speed, barrel temperatures, design,
   and the names and methods of the measured responses. No numbers or trends from the
   abstract, results, discussion, conclusions or result tables.
2. **Freeze before looking.** Predictions are written in `case-*.md` and committed to git
   before anyone opens the results. The commit time is the seal. Predictions are never
   edited after the seal; corrections go into a separate, later file.
3. **No forced answer.** Where the inputs do not support a direction, the prediction is
   `NO PREDICTION (INSUFFICIENT_DATA)`. That is a valid answer and is scored as such, not
   as a hit.
4. **Directions, not invented numbers.** Predictions are directional or ordinal (A > B,
   rises with X). No numeric result is invented. A numeric value appears only when it is
   computed from the stated inputs (for example a water fraction), and the formula is shown.
5. **Confidence is stated** for each prediction: high, medium or low. It is our own
   judgement, not a measured probability.
6. **Scoring after unsealing.** Each prediction is scored HIT, MISS, or NOT TESTABLE (the
   paper does not report that response or comparison). Results are copied from the paper
   with page and table references.
7. **Transfer to our extruder** is a separate section in each case: how we would run the
   same formulation on our machine. It is a plan, not a result, and it is not scored
   until we run it.

## Honesty limits (read before scoring)

- **Prior knowledge.** The predictor (the assistant) has general extrusion knowledge from
  training and may have seen these papers before. The blind step removes the results
  from this session. It cannot remove memory. A HIT is therefore weaker evidence than
  the same HIT from a fresh experiment on our machine.
- **Extraction by tool.** The inputs were extracted from each PDF by an automated reader
  that was told to return inputs only. Small inconsistencies are listed in each case and
  must be checked against the paper when it is unsealed.
- **Search snippets.** Web search results show short snippets. The snippets for the two
  cases below showed methods text only. Other papers whose snippets or metadata showed
  results were excluded (see the contamination log).

## Contamination log

| Paper | What leaked | Decision |
|---|---|---|
| Silva et al. 2023, cowpea, Clextral Evolum HT25, Braz. J. Food Technol. 26, e2022052 | The page metadata returned by the reader contained the full abstract, including result ranges and the optimum. | **Excluded.** Not usable as a blind case. |
| Kodo millet–chickpea, PMC4571246 | The search snippet stated the preferred conditions. | Excluded, not opened. |
| Soy protein isolate TVP, screw speed and die temperature, PMC10050532 / ResearchGate | The search snippet stated a trend (die temperature vs. expansion and density). The page itself was not readable. | Excluded, not opened. |

## Cases

| Case | Paper | Machine | Relevance |
|---|---|---|---|
| [case-01](case-01-ndm-puffing.md) | Schoenfuss et al., "Twin-screw extrusion puffing of non-fat dry milk powder" (AURI report) | Bühler DNDL-44, 44 mm, L/D 28 | Dairy powder with starch; lactose and protein at high load |
| [case-02](case-02-goji-wpc-evolum25.md) | Ménabréaz et al., "Goji Berry and Whey Protein Concentrate Enriched Rice Extrudates", Pol. J. Food Nutr. Sci. (2021) | Clextral Evolum 25 | Same machine family as ours; WPC 80 addition |

Our machine as seen on the photos sent on 2026-09-26: [machine-r3.md](machine-r3.md).

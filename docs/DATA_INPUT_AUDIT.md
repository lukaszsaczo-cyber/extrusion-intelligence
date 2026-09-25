# Input data audit (2026-09-25)

Read-only audit of the repository and the production database
(Supabase `obuaxunftadvgbfszhur`) before defining the input data contract.
Nothing in this document is a guess about the machine: where the answer is
"unknown", it stays unknown until real machine data exists.

## Real data present

| Table | Rows |
|---|---|
| organizations / organization_members | 1 / 1 |
| machines, sites, runs, run_metrics, run_files, run_sampling | 0 |
| signal_definitions, machine_sensor_tags, machine_confirmed_limits | 0 |
| materials, material_lots, recipes, recipe_versions, recipe_components | 0 |
| product_samples, product_measurements, product_targets, product_target_values | 0 |
| quality_*, state_snapshots, diagnoses, verifications, audit_records | 0 |

**There are zero real runs.** The tag list, sampling period, units, limits and
thresholds are therefore **unknown**, not assumed.

## What the schema already supports

| Contract item | Where | Status |
|---|---|---|
| Tag groups Process / Material / Product / Machine state | `signal_definitions.category` enum `PROCESS, MATERIAL, PRODUCT, MACHINE_STATE` | exists, empty |
| Machine tag → canonical signal + unit | `machine_sensor_tags (tag, signal, unit)` | exists, empty |
| timestamp | `run_metrics.ts` (timestamptz) + `raw_text` of the source value | exists |
| sampling_interval | `run_sampling.sampling_interval_ms` | exists, nullable = unknown |
| timestamp_source | `run_sampling.timestamp_source` enum `PLC, HISTORIAN, IMPORT_FILE, MANUAL` | exists |
| timestamp_resolution | `run_sampling.timestamp_resolution_ms` | exists |
| missing_sample_policy | `run_sampling.missing_sample_policy` enum `NOT_FILLED, MARKED_MISSING, FORWARD_FILLED, INTERPOLATED` | exists |
| source timezone | `run_sampling.source_timezone` | exists |
| sensor_quality (per sample) | `run_metrics.quality` enum `VALID, SUSPECT, MISSING, UNMAPPED` | exists |
| machine_state, alarm_state, sensor_status | no column; modelled as `MACHINE_STATE` signals | by design, no tags defined |
| material_lot, moisture | `material_lots (lot_code, moisture_pct, protein/fat/starch/fiber/sugar/ash_pct, evidence_source)` | exists |
| bulk_density, particle_size | **missing** (not a column; could be `MATERIAL` signals or lot columns) | open decision |
| recipe_version | `recipe_versions (version, status DRAFT/FINAL)` + `recipe_components` | exists |
| screw / die configuration | `process_plans.screw_configuration`, `process_plans.die` (free text) | exists, unversioned |
| configuration_version (machine) | only `machines.controller_version`, `software_version` | **no versioned machine configuration** |
| Product results | `product_samples` → `product_measurements (parameter, value, unit, method)`; targets in `product_target_values` | exists; `parameter` is free text, not tied to the signal dictionary |
| Machine limits | `machine_confirmed_limits (parameter, bound, value, unit, source CATALOG/CONFIRMED_ON_MACHINE)` | exists, empty |
| Verification | `verifications.state` enum `VERIFIED_PASS, VERIFIED_FAIL, INCONCLUSIVE, INCOMPLETE` | exists |

## Step 6 (quality filter) already in place

- Raw evidence is append-only: `run_metrics`, `run_files` (0006) and
  `product_measurements` (0012) cannot be updated or deleted by app users.
- Filter, not delete: `quality_assessments`, `quality_signal_results` and
  `quality_quarantined_metrics` (0008/0010) reference raw rows with a reason.
- Verdicts: `VALID, QUARANTINED, INSUFFICIENT_DATA`. Diagnosis statuses:
  `DIAGNOSED, INCONCLUSIVE, INSUFFICIENT_DATA`.
- Thresholds are **configuration, not truth**: `lib/quality/rules.ts`
  `RULESET_V0` has version `"v0-uncalibrated"`. Every run stores the ruleset
  version it was checked with.
  - `minValidSamples 10`, `gapFactor 2`, `minCoverage 0.9`: starting values
    only, to calibrate.
  - Spike rule (Hampel, halfWindow 3, k 8).
  - **The flatline rule is off by default** (opt-in per signal). When enabled,
    it needs both `minSeconds` and `minSamples`, so "60 s at 1 s" and
    "60 s at 10 s" are not treated as the same evidence.
  - Gap and coverage rules use `sampling_interval_ms`; without it the verdict is
    `SAMPLING_METADATA_MISSING`, and no interval is guessed.
  - Leaving confirmed limits is not a quarantine reason.
- Diagnosis gates (`lib/diagnosis/gates.ts`, gates-v0): `MACHINE_STABLE`,
  `DEVIATION_PERSISTENT` and `CAUSE_SEPARABLE` always return `UNKNOWN`, because
  their inputs (setpoint and residence-time tags, references, comparison runs)
  do not exist yet. Outcome: `INSUFFICIENT_DATA`, or `INCONCLUSIVE` if all
  gates pass. It is never a forced cause.

## Not implemented (gaps vs. the agreed loop)

1. **No knowledge store.** Nothing is saved as "knowledge" today, so the rule
   "FAIL → never saved as knowledge" is not violated, but it is also not
   enforced yet.
2. **No repair / controlled test / verification report flow.** The
   `verifications` table exists but no code writes to it.
3. **No cause model.** There is no diagnosis engine endpoint, so no step can
   produce `DIAGNOSED`.
4. **No machine configuration versioning** (screw, die, controller) that a run
   points to.
5. **Product parameters are free text** and not linked to signal definitions
   or units.
6. **bulk_density and particle_size** have no place in the schema.

## Tests present

- `lib/quality/rules.test.ts`: 14.
- `lib/import/run-file.test.ts`: 7.
- `lib/diagnosis/diagnosis.test.ts`: 6.
- `server/engine-contract/test/sanitizer.test.js`.

All of them use synthetic data. None use real machine data, because none exists.

## Needed from the plant before any threshold is set

- The real tag list with units, for each group (the list in the contract
  proposal is a requirements list, not a list of existing tags).
- Sampling interval, timestamp source and resolution per data source.
- How missing samples are exported.
- At least one real run export with the product results measured for it.

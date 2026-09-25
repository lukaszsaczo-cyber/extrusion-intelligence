// Step 6 of the diagnostic loop: data-quality rules. Pure, no I/O.
//
// Goal: separate MEASUREMENT anomalies from real process behaviour. A rule may
// quarantine a sample only when the sample itself is untrustworthy. Real process
// excursions (e.g. pressure above the machine limit) must stay visible to the
// diagnosis, so exceeding confirmed limits is NOT a quarantine reason here.
//
// Everything that depends on unknown facts returns INSUFFICIENT_DATA instead of
// assuming them. Thresholds are uncalibrated starting values (0 real runs yet);
// the ruleset version is stored with every assessment so results stay traceable
// when the rules are calibrated later.

export type Category = "PROCESS" | "MATERIAL" | "PRODUCT" | "MACHINE_STATE";
export type Verdict = "VALID" | "QUARANTINED" | "INSUFFICIENT_DATA";
export type SourceQuality = "VALID" | "SUSPECT" | "MISSING" | "UNMAPPED";
export type Reason =
  | "SOURCE_FLAGGED" | "PHYSICALLY_IMPOSSIBLE" | "SPIKE" | "FLATLINE"
  | "TIMESTAMP_GAP" | "TIMESTAMP_DUPLICATE"
  | "SAMPLING_METADATA_MISSING" | "SIGNAL_NOT_MAPPED" | "TOO_FEW_VALID_SAMPLES";

export type SignalRules = {
  // Hampel filter over neighbouring samples: robust to steps (setpoint changes),
  // catches single-sample excursions that return to the surrounding level.
  spike?: { halfWindow: number; k: number; minAbsDelta: number } | false;
  // Identical value for a long time. Only for signals that must vary (a setpoint
  // may legitimately stay constant for hours), so it is opt-in per signal.
  flatline?: { minSeconds: number; minSamples: number } | false;
  // Physically impossible values for this sensor. Opt-in: bounds are sensor facts.
  bounds?: { min?: number; max?: number } | false;
};

export type Ruleset = {
  version: string;
  minValidSamples: number;
  gapFactor: number; // a step > gapFactor x sampling interval is a gap
  minCoverage: number; // present / expected timestamps below this -> insufficient
  defaults: Record<Category, SignalRules>;
  overrides: Readonly<Record<string, SignalRules>>; // by canonical signal code
};

const SPIKE_DEFAULT = { halfWindow: 3, k: 8, minAbsDelta: 0 } as const;

export const RULESET_V0: Ruleset = {
  version: "v0-uncalibrated",
  minValidSamples: 10,
  gapFactor: 2,
  minCoverage: 0.9,
  defaults: {
    PROCESS: { spike: SPIKE_DEFAULT },
    MATERIAL: { spike: SPIKE_DEFAULT },
    PRODUCT: { spike: SPIKE_DEFAULT },
    MACHINE_STATE: {}, // discrete states: numeric outlier rules do not apply
  },
  overrides: {},
};

export type QSample = { id: string; signal: string; tsMs: number; value: number | null; quality: SourceQuality };
export type TagInfo = { code: string; category: Category };
export type SignalResult = { signal: string; verdict: Verdict; reasons: Reason[]; validSamples: number; quarantinedSamples: number };
export type Quarantine = { runMetricId: string; reason: Reason; detail: string | null };
export type Assessment = { rulesetVersion: string; verdict: Verdict; signals: SignalResult[]; quarantined: Quarantine[] };

export type AssessInput = {
  samples: readonly QSample[];
  tagMap: ReadonlyMap<string, TagInfo>; // raw source tag -> canonical signal
  samplingIntervalMs: number | null;
  ruleset?: Ruleset;
};

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

const rank: Record<Verdict, number> = { VALID: 0, QUARANTINED: 1, INSUFFICIENT_DATA: 2 };

export function assess(input: AssessInput): Assessment {
  const rs = input.ruleset ?? RULESET_V0;
  const bySignal = new Map<string, QSample[]>();
  for (const s of input.samples) {
    const list = bySignal.get(s.signal);
    if (list) list.push(s); else bySignal.set(s.signal, [s]);
  }

  const signals: SignalResult[] = [];
  const quarantined: Quarantine[] = [];
  let runVerdict: Verdict | null = null;

  for (const [signal, raw] of [...bySignal.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const tag = input.tagMap.get(signal);
    if (!tag) {
      // Unmapped source column: unusable as a whole; no per-sample rows needed.
      signals.push({ signal, verdict: "INSUFFICIENT_DATA", reasons: ["SIGNAL_NOT_MAPPED"], validSamples: 0, quarantinedSamples: 0 });
      continue;
    }
    const rules: SignalRules = { ...rs.defaults[tag.category], ...rs.overrides[tag.code] };
    const samples = [...raw].sort((a, b) => a.tsMs - b.tsMs || a.id.localeCompare(b.id));
    const flagged = new Map<string, Set<Reason>>();
    const reasons = new Set<Reason>();
    const flag = (s: QSample, reason: Reason, detail: string | null) => {
      const set = flagged.get(s.id) ?? new Set<Reason>();
      if (set.has(reason)) return;
      set.add(reason);
      flagged.set(s.id, set);
      reasons.add(reason);
      quarantined.push({ runMetricId: s.id, reason, detail });
    };

    // 1. Source already said the sample is not a clean number.
    for (const s of samples) if (s.quality !== "VALID" || s.value === null) flag(s, "SOURCE_FLAGGED", s.quality);

    // 2. Two samples of one signal at the same instant: which one is right is unknown.
    const perTs = new Map<number, QSample[]>();
    for (const s of samples) (perTs.get(s.tsMs) ?? perTs.set(s.tsMs, []).get(s.tsMs)!).push(s);
    for (const group of perTs.values()) if (group.length > 1) for (const s of group) flag(s, "TIMESTAMP_DUPLICATE", `${group.length} samples at same time`);

    // 3. Physically impossible values (only when bounds are configured).
    if (rules.bounds) {
      const { min, max } = rules.bounds;
      for (const s of samples) {
        if (flagged.has(s.id) || s.value === null) continue;
        if ((min !== undefined && s.value < min) || (max !== undefined && s.value > max)) {
          flag(s, "PHYSICALLY_IMPOSSIBLE", `value ${s.value} outside [${min ?? "-inf"}, ${max ?? "+inf"}]`);
        }
      }
    }

    // Candidates for the shape rules: clean, not yet flagged.
    const clean = samples.filter((s) => !flagged.has(s.id)) as (QSample & { value: number })[];

    // 4. Spike (Hampel). Needs a full window on both sides; edges are not judged.
    if (rules.spike) {
      const { halfWindow: h, k, minAbsDelta } = rules.spike;
      for (let i = h; i < clean.length - h; i++) {
        const neighbours = [...clean.slice(i - h, i), ...clean.slice(i + 1, i + 1 + h)].map((s) => s.value);
        const m = median(neighbours);
        const mad = 1.4826 * median(neighbours.map((v) => Math.abs(v - m)));
        const dev = Math.abs(clean[i]!.value - m);
        if (dev > Math.max(k * mad, minAbsDelta) && dev > 0) {
          flag(clean[i]!, "SPIKE", `value ${clean[i]!.value}, neighbour median ${m}`);
        }
      }
    }

    // 5. Flatline (opt-in).
    if (rules.flatline) {
      const { minSeconds, minSamples } = rules.flatline;
      let start = 0;
      for (let i = 1; i <= clean.length; i++) {
        if (i < clean.length && clean[i]!.value === clean[start]!.value) continue;
        const run = clean.slice(start, i);
        const seconds = (run[run.length - 1]!.tsMs - run[0]!.tsMs) / 1000;
        if (run.length >= minSamples && seconds >= minSeconds) {
          for (const s of run) flag(s, "FLATLINE", `constant ${run[0]!.value} for ${seconds} s`);
        }
        start = i;
      }
    }

    let insufficient = false;

    // 6. Completeness needs the sampling interval; without it, do not assume one.
    if (input.samplingIntervalMs === null) {
      reasons.add("SAMPLING_METADATA_MISSING");
      insufficient = true;
    } else {
      const times = [...perTs.keys()].sort((a, b) => a - b);
      const step = input.samplingIntervalMs;
      let gaps = 0;
      for (let i = 1; i < times.length; i++) if (times[i]! - times[i - 1]! > rs.gapFactor * step) gaps++;
      const expected = times.length > 1 ? Math.floor((times[times.length - 1]! - times[0]!) / step) + 1 : times.length;
      const coverage = expected > 0 ? times.length / expected : 0;
      if (gaps > 0) reasons.add("TIMESTAMP_GAP");
      if (coverage < rs.minCoverage) { reasons.add("TIMESTAMP_GAP"); insufficient = true; }
    }

    const quarantinedSamples = flagged.size;
    const validSamples = samples.length - quarantinedSamples;
    if (validSamples < rs.minValidSamples) { reasons.add("TOO_FEW_VALID_SAMPLES"); insufficient = true; }

    const verdict: Verdict = insufficient ? "INSUFFICIENT_DATA" : quarantinedSamples > 0 ? "QUARANTINED" : "VALID";
    signals.push({ signal, verdict, reasons: [...reasons].sort(), validSamples, quarantinedSamples });
    runVerdict = runVerdict === null || rank[verdict] > rank[runVerdict] ? verdict : runVerdict;
  }

  // Run verdict: worst verdict over mapped signals; with none mapped nothing can be judged.
  return { rulesetVersion: rs.version, verdict: runVerdict ?? "INSUFFICIENT_DATA", signals, quarantined };
}

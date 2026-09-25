"use server";
import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getSessionContext } from "@/server/context";
import { TooManySamples, loadQuarantinedIds, loadRunSamples, loadTagMap } from "@/server/run-data";
import { buildSnapshot, canonicalJson, type LimitRow, type Snapshot } from "@/lib/diagnosis/snapshot";
import { GATES_VERSION, evaluateGates } from "@/lib/diagnosis/gates";
import type { QSample, Verdict } from "@/lib/quality/rules";

async function prepare(formData: FormData) {
  const p = z.string().uuid().safeParse(formData.get("run_id"));
  if (!p.success) redirect("/runs");
  const back = `/runs/${p.data}/diagnosis`;
  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/dashboard");
  if (ctx.current.role !== "ADMIN" && ctx.current.role !== "ENGINEER") redirect(`${back}?e=forbidden`);
  const supabase = await createSupabaseServer();
  const { data: run } = await supabase.from("runs").select("id, run_code, machine_id, process_plan_id")
    .eq("id", p.data).eq("organization_id", ctx.current.organizationId).maybeSingle();
  if (!run) redirect("/runs");
  return { supabase, run, back, orgId: ctx.current.organizationId };
}

// State refresh: rebuild the run's picture from clean data after the latest
// quality check and store it as an append-only snapshot with its SHA-256.
export async function refreshState(formData: FormData) {
  const { supabase, run, back, orgId } = await prepare(formData);

  const { data: qa } = await supabase.from("quality_assessments").select("id, ruleset_version, verdict")
    .eq("run_id", run.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!qa) redirect(`${back}?e=noQuality`);

  const [machineRes, samplingRes, limitsRes, signalRes, predRes, planRes, tagMap] = await Promise.all([
    supabase.from("machines").select("id, screw_diameter_mm, l_d, drive_power_kw, configured_max_rpm, configured_max_pressure_bar, zone_count")
      .eq("id", run.machine_id).maybeSingle(),
    supabase.from("run_sampling").select("sampling_interval_ms").eq("run_id", run.id).maybeSingle(),
    supabase.from("machine_confirmed_limits").select("parameter, bound, value, unit").eq("machine_id", run.machine_id),
    supabase.from("quality_signal_results").select("signal, verdict").eq("assessment_id", qa.id),
    run.process_plan_id
      ? supabase.from("plan_predictions").select("id", { count: "exact", head: true }).eq("process_plan_id", run.process_plan_id)
      : Promise.resolve({ count: 0 }),
    run.process_plan_id
      ? supabase.from("process_plans").select("product_target_id").eq("id", run.process_plan_id).maybeSingle()
      : Promise.resolve({ data: null }),
    loadTagMap(supabase, run.machine_id, orgId),
  ]);
  const targetId = (planRes.data as { product_target_id: string | null } | null)?.product_target_id ?? null;
  const targetsRes = targetId
    ? await supabase.from("product_target_values").select("id", { count: "exact", head: true }).eq("product_target_id", targetId)
    : { count: 0 };

  let samples: QSample[] = [];
  let quarantinedIds = new Set<string>();
  try {
    [samples, quarantinedIds] = await Promise.all([loadRunSamples(supabase, run.id), loadQuarantinedIds(supabase, qa.id)]);
  } catch (e) {
    redirect(`${back}?e=${e instanceof TooManySamples ? "tooLarge" : "failed"}`);
  }

  const m = machineRes.data;
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const snapshot: Snapshot = buildSnapshot({
    run: { id: run.id, runCode: run.run_code, processPlanId: run.process_plan_id },
    machine: {
      id: run.machine_id, screwDiameterMm: num(m?.screw_diameter_mm), lD: num(m?.l_d), drivePowerKw: num(m?.drive_power_kw),
      maxRpm: num(m?.configured_max_rpm), maxPressureBar: num(m?.configured_max_pressure_bar), zoneCount: num(m?.zone_count),
    },
    samplingIntervalMs: num(samplingRes.data?.sampling_interval_ms),
    assessment: { id: qa.id, rulesetVersion: qa.ruleset_version, verdict: qa.verdict as Verdict },
    signalVerdicts: new Map((signalRes.data ?? []).map((r) => [r.signal as string, r.verdict as Verdict])),
    samples, quarantinedIds, tagMap,
    limits: (limitsRes.data ?? []).map((l) => ({ ...l, value: Number(l.value) })) as LimitRow[],
    references: { planPredictions: predRes.count ?? 0, productTargetValues: targetsRes.count ?? 0 },
  });

  const { error } = await supabase.from("state_snapshots").insert({
    organization_id: orgId, run_id: run.id, quality_assessment_id: qa.id,
    schema_version: snapshot.schema, snapshot,
    sha256: createHash("sha256").update(canonicalJson(snapshot), "utf8").digest("hex"),
  });
  if (error) {
    console.error("[diagnosis] snapshot insert failed", error.code);
    redirect(`${back}?e=${error.code === "42501" ? "forbidden" : "failed"}`);
  }
  revalidatePath(back);
  redirect(back);
}

// Diagnosis preconditions on the latest snapshot. v0 cannot pass every gate
// (see lib/diagnosis/gates.ts), so the recorded outcome says exactly what is
// missing. There is no engine diagnosis endpoint yet: if all gates ever pass,
// the outcome is INCONCLUSIVE, never an invented cause.
export async function runDiagnosis(formData: FormData) {
  const { supabase, run, back, orgId } = await prepare(formData);
  const { data: snap } = await supabase.from("state_snapshots").select("id, snapshot")
    .eq("run_id", run.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!snap) redirect(`${back}?e=noSnapshot`);

  const outcome = evaluateGates(snap.snapshot as Snapshot);
  const { error } = await supabase.from("diagnoses").insert({
    organization_id: orgId, run_id: run.id, snapshot_id: snap.id, gates_version: GATES_VERSION,
    status: outcome.status === "READY_FOR_ENGINE" ? "INCONCLUSIVE" : "INSUFFICIENT_DATA",
    gates: outcome.gates,
  });
  if (error) {
    console.error("[diagnosis] diagnosis insert failed", error.code);
    redirect(`${back}?e=${error.code === "42501" ? "forbidden" : "failed"}`);
  }
  revalidatePath(back);
  redirect(back);
}

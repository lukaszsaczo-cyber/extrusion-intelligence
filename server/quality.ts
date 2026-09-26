"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getSessionContext } from "@/server/context";
import { assess, type QSample } from "@/lib/quality/rules";
import { TooManySamples, loadRunSamples, loadTagMap } from "@/server/run-data";
import { logServerError } from "@/lib/log/server-error";

// Runs the step-6 rules over every sample of one run and records the result
// (append-only; a re-check creates a new assessment). Returns to the quality page
// with ?e=forbidden|failed|empty|tooLarge on error.
export async function runQualityCheck(formData: FormData) {
  const p = z.string().uuid().safeParse(formData.get("run_id"));
  if (!p.success) redirect("/runs");
  const runId = p.data;
  const back = `/runs/${runId}/quality`;

  const ctx = await getSessionContext();
  if (!ctx?.current) redirect("/dashboard");
  if (ctx.current.role !== "ADMIN" && ctx.current.role !== "ENGINEER") redirect(`${back}?e=forbidden`);
  const orgId = ctx.current.organizationId;

  const supabase = await createSupabaseServer();
  const { data: run } = await supabase.from("runs").select("id, machine_id")
    .eq("id", runId).eq("organization_id", orgId).maybeSingle();
  if (!run) redirect("/runs");

  const [samplingRes, tagMap] = await Promise.all([
    supabase.from("run_sampling").select("sampling_interval_ms").eq("run_id", run.id).maybeSingle(),
    loadTagMap(supabase, run.machine_id, orgId),
  ]);

  let samples: QSample[] = [];
  try {
    samples = await loadRunSamples(supabase, run.id);
  } catch (e) {
    redirect(`${back}?e=${e instanceof TooManySamples ? "tooLarge" : "failed"}`);
  }
  if (samples.length === 0) redirect(`${back}?e=empty`);

  const result = assess({
    samples, tagMap,
    samplingIntervalMs: (samplingRes.data?.sampling_interval_ms as number | null | undefined) ?? null,
  });

  const { error } = await supabase.rpc("record_quality_assessment", {
    p_run_id: run.id,
    p_ruleset_version: result.rulesetVersion,
    p_verdict: result.verdict,
    p_signals: result.signals.map((s) => ({
      signal: s.signal, verdict: s.verdict, reasons: s.reasons,
      valid_samples: s.validSamples, quarantined_samples: s.quarantinedSamples,
    })),
    p_quarantine: result.quarantined.map((q) => ({ run_metric_id: q.runMetricId, reason: q.reason, detail: q.detail })),
  });
  if (error) {
    logServerError("recordQualityAssessment", error);
    redirect(`${back}?e=${error.code === "42501" ? "forbidden" : "failed"}`);
  }
  revalidatePath(back);
  redirect(back);
}

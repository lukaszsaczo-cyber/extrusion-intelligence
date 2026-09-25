"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getSessionContext } from "@/server/context";
import { assess, type Category, type QSample, type SourceQuality, type TagInfo } from "@/lib/quality/rules";

const PAGE = 1000; // PostgREST returns at most 1000 rows per request
const MAX_SAMPLES = 500_000;

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

  const [samplingRes, tagsRes, defsRes] = await Promise.all([
    supabase.from("run_sampling").select("sampling_interval_ms").eq("run_id", run.id).maybeSingle(),
    supabase.from("machine_sensor_tags").select("tag, signal").eq("machine_id", run.machine_id).not("signal", "is", null),
    supabase.from("signal_definitions").select("code, category").eq("organization_id", orgId),
  ]);
  const categoryOf = new Map((defsRes.data ?? []).map((d) => [d.code as string, d.category as Category]));
  const tagMap = new Map<string, TagInfo>();
  for (const t of tagsRes.data ?? []) {
    const category = categoryOf.get(t.signal as string);
    if (category) tagMap.set(t.tag as string, { code: t.signal as string, category });
  }

  const samples: QSample[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("run_metrics").select("id, signal, ts, value, quality")
      .eq("run_id", run.id).order("id").range(from, from + PAGE - 1);
    if (error) redirect(`${back}?e=failed`);
    for (const m of data ?? []) {
      samples.push({
        id: m.id as string, signal: m.signal as string, tsMs: Date.parse(m.ts as string),
        value: m.value === null ? null : Number(m.value), quality: m.quality as SourceQuality,
      });
    }
    if (!data || data.length < PAGE) break;
    if (samples.length > MAX_SAMPLES) redirect(`${back}?e=tooLarge`);
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
    console.error("[quality] record assessment failed", error.code);
    redirect(`${back}?e=${error.code === "42501" ? "forbidden" : "failed"}`);
  }
  revalidatePath(back);
  redirect(back);
}

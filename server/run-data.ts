import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Category, QSample, SourceQuality, TagInfo } from "@/lib/quality/rules";
import { logServerError } from "@/lib/log/server-error";

const PAGE = 1000; // PostgREST returns at most 1000 rows per request
export const MAX_RUN_SAMPLES = 500_000;

export class TooManySamples extends Error {}

// All samples of one run, paged. Throws TooManySamples above MAX_RUN_SAMPLES.
export async function loadRunSamples(supabase: SupabaseClient, runId: string): Promise<QSample[]> {
  const samples: QSample[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("run_metrics").select("id, signal, ts, value, quality")
      .eq("run_id", runId).order("id").range(from, from + PAGE - 1);
    if (error) {
      logServerError("loadRunSamples", error);
      throw error;
    }
    for (const m of data ?? []) {
      samples.push({
        id: m.id as string, signal: m.signal as string, tsMs: Date.parse(m.ts as string),
        value: m.value === null ? null : Number(m.value), quality: m.quality as SourceQuality,
      });
    }
    if (!data || data.length < PAGE) return samples;
    if (samples.length > MAX_RUN_SAMPLES) throw new TooManySamples();
  }
}

// Ids of samples quarantined by one assessment, paged.
export async function loadQuarantinedIds(supabase: SupabaseClient, assessmentId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("quality_quarantined_metrics").select("run_metric_id")
      .eq("assessment_id", assessmentId).order("id").range(from, from + PAGE - 1);
    if (error) {
      logServerError("loadQuarantinedIds", error);
      throw error;
    }
    for (const q of data ?? []) ids.add(q.run_metric_id as string);
    if (!data || data.length < PAGE) return ids;
  }
}

export type MappedTag = TagInfo & { unit: string | null };

// Raw source tag -> canonical signal (code, category, unit) for one machine.
export async function loadTagMap(supabase: SupabaseClient, machineId: string, orgId: string): Promise<Map<string, MappedTag>> {
  const [tagsRes, defsRes] = await Promise.all([
    supabase.from("machine_sensor_tags").select("tag, signal, unit").eq("machine_id", machineId).not("signal", "is", null),
    supabase.from("signal_definitions").select("code, category, canonical_unit").eq("organization_id", orgId),
  ]);
  const defs = new Map((defsRes.data ?? []).map((d) => [d.code as string, d]));
  const map = new Map<string, MappedTag>();
  for (const t of tagsRes.data ?? []) {
    const def = defs.get(t.signal as string);
    if (!def) continue;
    map.set(t.tag as string, {
      code: def.code as string, category: def.category as Category,
      unit: (t.unit as string | null) ?? (def.canonical_unit as string | null) ?? null,
    });
  }
  return map;
}

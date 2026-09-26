"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";
import { getSessionContext } from "@/server/context";
import { MAX_FILE_BYTES, buildSamples, type ImportError, type SampleQuality } from "@/lib/import/run-file";
import { logServerError } from "@/lib/log/server-error";

export type ImportState =
  | { status: "idle" }
  | { status: "error"; code: "invalid" | "forbidden" | "failed" | "tooLarge" | "empty" | "duplicate" | "samplingConflict" | "notFound" }
  | { status: "parseError"; errors: ImportError[] }
  | { status: "unmapped"; columns: string[] }
  | {
      status: "ok"; filename: string; rows: number; columns: number;
      counts: Record<SampleQuality, number>; firstTs: string; lastTs: string; unmapped: string[];
    };

const optInt = z.string().trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 86_400_000))
  .nullable().default(null);
const optEnum = <T extends [string, ...string[]]>(values: T) =>
  z.union([z.literal(""), z.enum(values)]).transform((v) => (v === "" ? null : v)).nullable().default(null);

const Input = z.object({
  run_id: z.string().uuid(),
  delimiter: z.enum(["comma", "semicolon", "tab"]),
  decimal: z.enum(["dot", "comma"]),
  timestamp_column: z.string().trim().min(1).max(200),
  timestamp_format: z.enum(["iso_offset", "epoch_s", "epoch_ms"]),
  accept_unmapped: z.literal("on").optional(),
  sampling_interval_ms: optInt,
  timestamp_resolution_ms: optInt,
  timestamp_source: optEnum(["PLC", "HISTORIAN", "IMPORT_FILE", "MANUAL"]),
  missing_sample_policy: optEnum(["NOT_FILLED", "MARKED_MISSING", "FORWARD_FILLED", "INTERPOLATED"]),
  source_timezone: z.string().trim().max(64).transform((v) => (v === "" ? null : v)).nullable().default(null),
});

const DELIMITERS = { comma: ",", semicolon: ";", tab: "\t" } as const;
const DECIMALS = { dot: ".", comma: "," } as const;

export async function importRunFile(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const fields = Object.fromEntries(
    Object.keys(Input.shape).map((k) => [k, formData.get(k) ?? undefined]),
  );
  const p = Input.safeParse(fields);
  if (!p.success) return { status: "error", code: "invalid" };
  const input = p.data;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { status: "error", code: "empty" };
  if (file.size > MAX_FILE_BYTES) return { status: "error", code: "tooLarge" };

  const ctx = await getSessionContext();
  if (!ctx?.current) return { status: "error", code: "forbidden" };
  if (ctx.current.role === "VIEWER") return { status: "error", code: "forbidden" };
  const orgId = ctx.current.organizationId;

  const supabase = await createSupabaseServer();
  const { data: run } = await supabase.from("runs").select("id, machine_id")
    .eq("id", input.run_id).eq("organization_id", orgId).maybeSingle();
  if (!run) return { status: "error", code: "notFound" };

  // Only tags mapped to a canonical signal are interpreted as numbers.
  const [tagsRes, defsRes] = await Promise.all([
    supabase.from("machine_sensor_tags").select("tag, signal, unit")
      .eq("machine_id", run.machine_id).not("signal", "is", null),
    supabase.from("signal_definitions").select("code, canonical_unit").eq("organization_id", orgId),
  ]);
  const canonicalUnit = new Map((defsRes.data ?? []).map((d) => [d.code as string, d.canonical_unit as string | null]));
  const mappedTags = new Map<string, string | null>(
    (tagsRes.data ?? []).map((t) => [t.tag as string, (t.unit as string | null) ?? canonicalUnit.get(t.signal as string) ?? null]),
  );

  const bytes = Buffer.from(await file.arrayBuffer());
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const parsed = buildSamples(text, {
    delimiter: DELIMITERS[input.delimiter],
    decimal: DECIMALS[input.decimal],
    timestampColumn: input.timestamp_column,
    timestampFormat: input.timestamp_format,
    mappedTags,
  });
  if (!parsed.ok) return { status: "parseError", errors: parsed.errors };

  // Unmapped columns are stored as text only and can never be re-interpreted
  // (evidence is append-only and the same file cannot be imported twice).
  if (parsed.unmappedColumns.length > 0 && input.accept_unmapped !== "on") {
    return { status: "unmapped", columns: parsed.unmappedColumns };
  }

  const sampling = {
    sampling_interval_ms: input.sampling_interval_ms,
    timestamp_source: input.timestamp_source,
    timestamp_resolution_ms: input.timestamp_resolution_ms,
    missing_sample_policy: input.missing_sample_policy,
    source_timezone: input.source_timezone,
  };
  const anySampling = Object.values(sampling).some((v) => v !== null);

  const { error } = await supabase.rpc("import_run_file", {
    p_run_id: run.id,
    p_filename: file.name.slice(0, 255) || "upload.csv",
    p_sha256: createHash("sha256").update(bytes).digest("hex"),
    p_size_bytes: file.size,
    p_row_count: parsed.rowCount,
    p_column_count: parsed.columnCount,
    p_sampling: anySampling ? sampling : null,
    p_metrics: parsed.samples,
  });
  if (error) {
    logServerError("importRunFile", error);
    if (error.code === "23505") return { status: "error", code: "duplicate" };
    if (error.code === "23514" && error.message.includes("sampling metadata")) {
      return { status: "error", code: "samplingConflict" };
    }
    if (error.code === "42501") return { status: "error", code: "forbidden" };
    return { status: "error", code: "failed" };
  }

  revalidatePath(`/runs/${run.id}/import`);
  revalidatePath("/runs");
  return {
    status: "ok", filename: file.name, rows: parsed.rowCount, columns: parsed.columnCount,
    counts: parsed.counts, firstTs: parsed.firstTs, lastTs: parsed.lastTs, unmapped: parsed.unmappedColumns,
  };
}

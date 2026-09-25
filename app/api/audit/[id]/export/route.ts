import { NextResponse } from "next/server";
import { getSessionContext } from "@/server/context";
import { createSupabaseServer } from "@/lib/supabase/server";
import { buildAuditExport, type AuditRecordRow, type Integrity } from "@/lib/audit/export";

// JSON export of one audit record, under the caller's RLS. Only allowlisted
// fields are exported (lib/audit/export.ts).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const ctx = await getSessionContext();
  if (!ctx?.current) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const orgId = ctx.current.organizationId;
  const supabase = await createSupabaseServer();
  const { data } = await supabase.from("audit_records").select("id, run_id, created_at, final_hash, snapshot")
    .eq("id", id).eq("organization_id", orgId).maybeSingle();
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const { data: integ } = await supabase.rpc("audit_integrity", { p_org: orgId }).eq("id", id);
  const row = ((integ ?? []) as { id: string; seq: number | null; hash_ok: boolean; chain_ok: boolean }[])[0];
  const integrity: Integrity = row ? { seq: row.seq, hash_ok: row.hash_ok, chain_ok: row.chain_ok } : null;
  const body = buildAuditExport(data as AuditRecordRow, integrity, new Date().toISOString());
  const code = String((data.snapshot as { run?: { run_code?: unknown } } | null)?.run?.run_code ?? "run").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 40);
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="audit-${code}-${id.slice(0, 8)}.json"`,
      "cache-control": "no-store",
    },
  });
}

import { NextResponse } from "next/server";
import { getEngineHealth } from "@/server/engine";

export const dynamic = "force-dynamic";

// Public health check: app status + engine connected flag only. No URLs, versions or internals.
export async function GET() {
  const engine = await getEngineHealth();
  return NextResponse.json({ status: "ok", engineConnected: engine.connected });
}

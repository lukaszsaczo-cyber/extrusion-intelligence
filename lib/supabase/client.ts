"use client";
import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://obuaxunftadvgbfszhur.supabase.co";
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  "sb_publishable_Q6TrOivKuqllyn3t9rxGAA__KFvimgh";

export function createSupabaseBrowser() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
}

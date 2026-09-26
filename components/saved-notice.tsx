"use client";
import { useSearchParams } from "next/navigation";

// Shown after a successful save (?ok=1 set by the server action).
export function SavedNotice({ text }: { text: string }) {
  const ok = useSearchParams().get("ok");
  if (!ok) return null;
  return <p role="status" className="mb-4 rounded border border-teal/50 px-3 py-2 text-sm text-teal">{text}</p>;
}

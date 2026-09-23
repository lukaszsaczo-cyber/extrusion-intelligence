"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav";

export function Sidebar({ labels }: { labels: Record<string, string> }) {
  const active = usePathname().split("/")[1];
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5 text-sm">
      {NAV.map((s) => (
        <Link
          key={s}
          href={`/${s}`}
          aria-current={active === s ? "page" : undefined}
          className={`rounded px-3 py-2 ${active === s ? "bg-panel-2 text-ink" : "text-muted hover:bg-panel-2 hover:text-ink"}`}
        >
          {labels[s] ?? s}
        </Link>
      ))}
    </nav>
  );
}

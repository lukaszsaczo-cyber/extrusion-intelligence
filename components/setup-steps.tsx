import Link from "next/link";
import type { SetupStep } from "@/lib/wizard/steps";

// What must exist before a process plan can be made; the first missing step is highlighted.
export function SetupSteps({ steps, labels, title, doneLabel, todoLabel }: {
  steps: SetupStep[]; labels: Record<SetupStep["key"], string>; title: string; doneLabel: string; todoLabel: string;
}) {
  const next = steps.find((s) => !s.done)?.key;
  return (
    <section className="rounded-md border border-line bg-panel">
      <h2 className="border-b border-line px-4 py-3 text-sm font-medium">{title}</h2>
      <ol className="divide-y divide-line">
        {steps.map((s, i) => (
          <li key={s.key} className={`flex items-center gap-3 px-4 py-2 text-sm ${s.key === next ? "bg-ground" : ""}`}>
            <span className="num w-5 text-muted">{i + 1}.</span>
            <span className={s.done ? "text-teal" : s.key === next ? "text-ink" : "text-muted"} aria-hidden>{s.done ? "✓" : "○"}</span>
            <span className="mr-auto">{labels[s.key]}</span>
            {s.done ? <span className="text-muted">{doneLabel}</span>
              : <Link href={s.href} className={s.key === next ? "rounded bg-teal px-3 py-1 font-medium text-ground" : "text-teal hover:underline"}>{todoLabel}</Link>}
          </li>
        ))}
      </ol>
    </section>
  );
}

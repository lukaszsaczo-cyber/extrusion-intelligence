"use client";
import { useFormStatus } from "react-dom";

// Disabled while the form is being sent, so one click saves one record.
export function SubmitButton({ label, className }: { label: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} aria-busy={pending}
      className={`${className ?? "rounded bg-teal px-3 py-2 text-sm font-medium text-ground"} disabled:cursor-wait disabled:opacity-60`}>
      {pending ? `${label}…` : label}
    </button>
  );
}

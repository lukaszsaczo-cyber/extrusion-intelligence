"use client";

export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="rounded border border-line px-3 py-2 text-sm print:hidden">
      {label}
    </button>
  );
}

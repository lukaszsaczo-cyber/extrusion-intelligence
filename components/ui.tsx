// Small shared building blocks for the data sections. Server components only.

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="mr-auto text-xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}

export function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-md border border-line bg-panel">
      <h2 className="border-b border-line px-4 py-3 text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="px-4 py-6 text-sm text-muted">{text}</p>;
}

export function Notice({ text, tone = "muted" }: { text: string; tone?: "muted" | "stop" }) {
  return <p className={`px-4 py-3 text-sm ${tone === "stop" ? "text-stop" : "text-muted"}`}>{text}</p>;
}

const FORM_ERRORS = ["invalid", "forbidden", "failed"] as const;

// Maps the ?e= code set by server actions to an i18n key, or null.
export function formErrorKey(e: string | undefined): string | null {
  return e && (FORM_ERRORS as readonly string[]).includes(e) ? `errors.${e}` : null;
}

export function DataTable({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-muted">
          <tr>{head.map((h) => <th key={h} className="px-4 py-2 font-normal">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-t border-line">
              {cells.map((c, j) => <td key={j} className="px-4 py-2">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const input = "w-full rounded border border-line bg-ground px-3 py-2 text-sm outline-none focus:border-teal";

export function Field({ label, name, type = "text", required, step, min, max, maxLength }: {
  label: string; name: string; type?: "text" | "number"; required?: boolean;
  step?: string; min?: number; max?: number; maxLength?: number;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <input name={name} type={type} required={required} step={step} min={min} max={max}
        maxLength={maxLength ?? (type === "text" ? 200 : undefined)} className={input} />
    </label>
  );
}

export function Select({ label, name, options, required }: {
  label: string; name: string; options: { value: string; label: string }[]; required?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-muted">{label}</span>
      <select name={name} required={required} className={input}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function FormGrid({ action, submit, children }: {
  action: (formData: FormData) => Promise<void>; submit: string; children: React.ReactNode;
}) {
  return (
    <form action={action} className="grid gap-3 px-4 py-4 sm:grid-cols-2 lg:grid-cols-3">
      {children}
      <div className="flex items-end">
        <button className="rounded bg-teal px-3 py-2 text-sm font-medium text-ground">{submit}</button>
      </div>
    </form>
  );
}

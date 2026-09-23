"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/client";

type Labels = { email: string; password: string; signIn: string; signUp: string; toSignUp: string; toSignIn: string; checkEmail: string; failed: string };

export function LoginForm({ labels }: { labels: Labels }) {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") ?? "");
    const password = String(fd.get("password") ?? "");
    setBusy(true);
    setMsg(null);
    const supabase = createSupabaseBrowser();
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) return setMsg({ kind: "error", text: labels.failed });
      router.replace("/dashboard");
      router.refresh();
    } else {
      const { error } = await supabase.auth.signUp({
        email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      setBusy(false);
      setMsg(error ? { kind: "error", text: labels.failed } : { kind: "info", text: labels.checkEmail });
    }
  }

  const field = "w-full rounded border border-line bg-ground px-3 py-2 text-sm outline-none focus:border-teal";
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block text-sm">
        <span className="mb-1 block text-muted">{labels.email}</span>
        <input name="email" type="email" required autoComplete="email" className={field} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-muted">{labels.password}</span>
        <input name="password" type="password" required minLength={8}
          autoComplete={mode === "in" ? "current-password" : "new-password"} className={field} />
      </label>
      {msg && (
        <p role="status" className={`text-sm ${msg.kind === "error" ? "text-stop" : "text-muted"}`}>{msg.text}</p>
      )}
      <button disabled={busy} className="w-full rounded bg-teal px-3 py-2 text-sm font-medium text-ground disabled:opacity-60">
        {mode === "in" ? labels.signIn : labels.signUp}
      </button>
      <button type="button" onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(null); }}
        className="w-full text-center text-sm text-muted hover:text-ink">
        {mode === "in" ? labels.toSignUp : labels.toSignIn}
      </button>
    </form>
  );
}

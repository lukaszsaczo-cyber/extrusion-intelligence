import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// User-context client: every query runs under the signed-in user's RLS.
export async function createSupabaseServer() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // Called from a Server Component: middleware refreshes the session instead.
          }
        },
      },
    },
  );
}

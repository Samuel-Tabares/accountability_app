import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function envOrThrow(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient<any>(envOrThrow("NEXT_PUBLIC_SUPABASE_URL"), envOrThrow("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      getAll() {
        return cookieStore.getAll().map(({ name, value }) => ({ name, value }));
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot always write cookies; route handlers should handle persistence.
        }
      }
    }
  });
}

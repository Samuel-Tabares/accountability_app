import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";

function envOrThrow(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export function createSupabaseMiddlewareClient(request: NextRequest) {
  return createServerClient<any>(envOrThrow("NEXT_PUBLIC_SUPABASE_URL"), envOrThrow("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      getAll() {
        return request.cookies.getAll().map(({ name, value }) => ({ name, value }));
      },
      setAll() {
        // Middleware only reads the session to authorize redirects.
      }
    }
  });
}

import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

function envOrThrow(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export function createSupabaseRouteClient(request: NextRequest, response: NextResponse) {
  return createServerClient<any>(envOrThrow("NEXT_PUBLIC_SUPABASE_URL"), envOrThrow("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
    cookies: {
      getAll() {
        return request.cookies.getAll().map(({ name, value }) => ({ name, value }));
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      }
    }
  });
}

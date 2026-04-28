import { NextRequest, NextResponse } from "next/server";
import { createSupabaseRouteClient } from "@/src/lib/supabase/route";

export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  const supabase = createSupabaseRouteClient(request, response);
  await supabase.auth.signOut();
  return response;
}

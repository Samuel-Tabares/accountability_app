type CookieLike = {
  get(name: string): { value: string } | undefined;
};

export type SupabaseSessionCookie = {
  userId: string;
  email?: string;
  username?: string;
  fullName?: string;
  ambassadorId?: string;
  phone?: string;
  role?: string;
};

function storageKeyFromUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error("Missing environment variable: NEXT_PUBLIC_SUPABASE_URL");
  }

  const projectRef = new URL(url).hostname.split(".")[0];
  return `sb-${projectRef}-auth-token`;
}

function decodeBase64Value(value: string) {
  const encoded = value.startsWith("base64-") ? value.slice("base64-".length) : value;
  return Buffer.from(encoded, "base64").toString("utf8");
}

export function readSupabaseSessionCookie(cookies: CookieLike): SupabaseSessionCookie | null {
  const cookie = cookies.get(storageKeyFromUrl());
  if (!cookie?.value) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Value(cookie.value));
    const user = payload?.user;
    const userId = typeof user?.id === "string" ? user.id : null;
    if (!userId) {
      return null;
    }

    const userMetadata = user?.user_metadata ?? {};
    const appMetadata = user?.app_metadata ?? {};
    const role = user?.user_metadata?.role ?? user?.app_metadata?.role;
    return {
      userId,
      email: typeof user?.email === "string" ? user.email : undefined,
      username: typeof userMetadata.username === "string" ? userMetadata.username : undefined,
      fullName: typeof userMetadata.full_name === "string" ? userMetadata.full_name : undefined,
      ambassadorId: typeof userMetadata.ambassador_id === "string" ? userMetadata.ambassador_id : undefined,
      phone: typeof userMetadata.phone === "string" ? userMetadata.phone : undefined,
      role: typeof role === "string" ? role : undefined
    };
  } catch {
    return null;
  }
}

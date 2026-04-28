import { createClient } from "@supabase/supabase-js";

function envOrThrow(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function normalizeHandle(value) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

  if (!normalized) {
    throw new Error("Invalid handle");
  }

  return normalized;
}

function buildAuthAliasEmail(identifier, aliasDomain) {
  return `${normalizeHandle(identifier)}@${aliasDomain}`;
}

async function findUserByEmail(admin, email) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) {
    throw new Error(error.message);
  }

  return data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

async function upsertAuthAliasUser(admin, { identifier, password, fullName, phone, role, aliasDomain }) {
  const username = normalizeHandle(identifier);
  const email = buildAuthAliasEmail(username, aliasDomain);
  const userMetadata = {
    username,
    ambassador_id: username,
    code: username,
    full_name: fullName,
    phone: phone ?? "",
    role
  };

  const existingUser = await findUserByEmail(admin, email);

  if (existingUser) {
    const { data, error } = await admin.auth.admin.updateUserById(existingUser.id, {
      email,
      password,
      email_confirm: true,
      user_metadata: userMetadata,
      app_metadata: { role }
    });

    if (error || !data.user) {
      throw new Error(error?.message ?? "Unable to update auth user.");
    }

    return { user: data.user, email, username };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: userMetadata,
    app_metadata: { role }
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Unable to create auth user.");
  }

  return { user: data.user, email, username };
}

async function upsertProfile(admin, { id, email, username, fullName, phone, role, ambassadorId, isActive = true }) {
  const { error } = await admin.from("profiles").upsert(
    {
      id,
      email,
      username,
      full_name: fullName,
      phone: phone ?? null,
      role,
      ambassador_id: ambassadorId ?? null,
      is_active: isActive
    },
    {
      onConflict: "id"
    }
  );

  if (error) {
    throw new Error(error.message);
  }
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_BOOTSTRAP_ADMIN !== "true") {
    throw new Error("Bootstrap admin is disabled in production.");
  }

  if (process.env.ALLOW_BOOTSTRAP_ADMIN !== "true") {
    throw new Error("Set ALLOW_BOOTSTRAP_ADMIN=true to run this bootstrap script.");
  }

  const supabaseUrl = envOrThrow("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = envOrThrow("SUPABASE_SERVICE_ROLE_KEY");
  const aliasDomain = envOrThrow("SUPABASE_AUTH_ALIAS_DOMAIN");

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const username = normalizeHandle("samuel");
  const password = "samuel123";

  const authUser = await upsertAuthAliasUser(admin, {
    identifier: username,
    password,
    fullName: "Samuel",
    phone: null,
    role: "admin",
    aliasDomain
  });

  await upsertProfile(admin, {
    id: authUser.user.id,
    email: authUser.email,
    username,
    fullName: "Samuel",
    phone: null,
    role: "admin",
    isActive: true
  });

  console.log(`Bootstrap admin ready: ${username} / ${password} (${authUser.email})`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

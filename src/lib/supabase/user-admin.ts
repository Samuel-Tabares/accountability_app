import type { AppRole } from "./types";
import { buildAuthAliasEmail, normalizeHandle } from "@/src/lib/identity";

export type AliasUserInput = {
  identifier: string;
  password: string;
  fullName: string;
  phone?: string | null;
  role: AppRole;
  aliasDomain: string;
};

export type ProfileUpsertInput = {
  id: string;
  email: string;
  username: string;
  fullName: string;
  phone?: string | null;
  role: AppRole;
  ambassadorId?: string | null;
  level?: "nivel0" | "plata" | "oro" | "diamante";
  mustChangePassword?: boolean;
  isActive?: boolean;
};

async function findUserByEmail(admin: any, email: string) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) {
    throw new Error(error.message);
  }

  return data.users.find((user: { email?: string | null }) => user.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

export async function upsertAuthAliasUser(admin: any, input: AliasUserInput) {
  const username = normalizeHandle(input.identifier);
  const email = buildAuthAliasEmail(username, input.aliasDomain);
  const userMetadata = {
    username,
    ambassador_id: username,
    code: username,
    full_name: input.fullName,
    phone: input.phone ?? "",
    role: input.role
  };

  const existingUser = await findUserByEmail(admin, email);

  if (existingUser) {
    const { data, error } = await admin.auth.admin.updateUserById(existingUser.id, {
      email,
      password: input.password,
      email_confirm: true,
      user_metadata: userMetadata,
      app_metadata: { role: input.role }
    });

    if (error || !data.user) {
      throw new Error(error?.message ?? "Unable to update auth user.");
    }

    return { user: data.user, email, username };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: userMetadata,
    app_metadata: { role: input.role }
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "Unable to create auth user.");
  }

  return { user: data.user, email, username };
}

export async function upsertProfile(admin: any, input: ProfileUpsertInput) {
  const { error } = await admin.from("profiles").upsert(
    {
      id: input.id,
      email: input.email,
      username: input.username,
      full_name: input.fullName,
      phone: input.phone ?? null,
      role: input.role,
      ambassador_id: input.ambassadorId ?? null,
      level: input.level ?? "nivel0",
      must_change_password: input.mustChangePassword ?? false,
      is_active: input.isActive ?? true
    },
    {
      onConflict: "id"
    }
  );

  if (error) {
    throw new Error(error.message);
  }
}

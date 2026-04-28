alter table public.profiles
  add column if not exists username text,
  add column if not exists phone text;

update public.profiles
set username = coalesce(username, nullif(split_part(email, '@', 1), '')),
    ambassador_id = coalesce(ambassador_id, nullif(split_part(email, '@', 1), ''))
where username is null
   or ambassador_id is null;

alter table public.profiles
  alter column username set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_username_key'
  ) then
    alter table public.profiles add constraint profiles_username_key unique (username);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_username_matches_code'
  ) then
    alter table public.profiles add constraint profiles_username_matches_code check (
      ambassador_id is null or username = ambassador_id
    );
  end if;
end $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  has_admin boolean;
  profile_role public.app_role;
  normalized_username text;
  normalized_code text;
begin
  normalized_username := nullif(lower(trim(coalesce(new.raw_user_meta_data ->> 'username', split_part(coalesce(new.email, ''), '@', 1)))), '');
  normalized_code := nullif(lower(trim(coalesce(new.raw_user_meta_data ->> 'ambassador_id', new.raw_user_meta_data ->> 'code', normalized_username))), '');

  select exists (
    select 1
    from public.profiles
    where role = 'admin'
  ) into has_admin;

  if has_admin then
    profile_role := 'embajador';
  else
    profile_role := 'admin';
  end if;

  insert into public.profiles (id, email, username, full_name, phone, role, ambassador_id, is_active)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(normalized_username, split_part(coalesce(new.email, ''), '@', 1)),
    nullif(coalesce(new.raw_user_meta_data ->> 'full_name', normalized_username, split_part(coalesce(new.email, ''), '@', 1)), ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    profile_role,
    coalesce(normalized_code, normalized_username),
    true
  )
  on conflict (id) do update
    set email = excluded.email,
        username = excluded.username,
        full_name = coalesce(excluded.full_name, public.profiles.full_name),
        phone = coalesce(excluded.phone, public.profiles.phone),
        ambassador_id = coalesce(excluded.ambassador_id, public.profiles.ambassador_id),
        updated_at = now();

  return new;
end;
$$;

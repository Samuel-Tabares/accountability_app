create extension if not exists pgcrypto;

do $$
begin
  create type public.app_role as enum ('admin', 'embajador');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text,
  role public.app_role not null default 'embajador',
  ambassador_id text unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id) on delete cascade,
  ambassador_profile_id uuid references public.profiles (id) on delete set null,
  amount numeric(12, 2) not null check (amount >= 0),
  quantity integer not null default 1 check (quantity > 0),
  note text
);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id) on delete cascade,
  ambassador_profile_id uuid references public.profiles (id) on delete set null,
  category text not null,
  description text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  expense_type text not null check (expense_type in ('monthly', 'oneTime', 'commission', 'discount'))
);

alter table public.profiles enable row level security;
alter table public.sales enable row level security;
alter table public.expenses enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  has_admin boolean;
  profile_role public.app_role;
begin
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

  insert into public.profiles (id, email, full_name, role, ambassador_id, is_active)
  values (
    new.id,
    coalesce(new.email, ''),
    nullif(coalesce(new.raw_user_meta_data ->> 'full_name', split_part(coalesce(new.email, ''), '@', 1)), ''),
    profile_role,
    nullif(new.raw_user_meta_data ->> 'ambassador_id', ''),
    true
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, public.profiles.full_name),
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin"
on public.profiles
for select
using (
  auth.uid() = id
  or exists (
    select 1
    from public.profiles as viewer
    where viewer.id = auth.uid()
      and viewer.role = 'admin'
      and viewer.is_active
  )
);

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
on public.profiles
for update
using (
  exists (
    select 1
    from public.profiles as viewer
    where viewer.id = auth.uid()
      and viewer.role = 'admin'
      and viewer.is_active
  )
)
with check (
  exists (
    select 1
    from public.profiles as viewer
    where viewer.id = auth.uid()
      and viewer.role = 'admin'
      and viewer.is_active
  )
);

drop policy if exists "sales_select_owner_or_admin" on public.sales;
create policy "sales_select_owner_or_admin"
on public.sales
for select
using (
  ambassador_profile_id = auth.uid()
  or exists (
    select 1
    from public.profiles as viewer
    where viewer.id = auth.uid()
      and viewer.role = 'admin'
      and viewer.is_active
  )
);

drop policy if exists "sales_insert_owner_or_admin" on public.sales;
create policy "sales_insert_owner_or_admin"
on public.sales
for insert
with check (
  created_by = auth.uid()
  and (
    ambassador_profile_id = auth.uid()
    or exists (
      select 1
      from public.profiles as viewer
      where viewer.id = auth.uid()
        and viewer.role = 'admin'
        and viewer.is_active
    )
  )
);

drop policy if exists "sales_update_admin" on public.sales;
create policy "sales_update_admin"
on public.sales
for update
using (
  exists (
    select 1
    from public.profiles as viewer
    where viewer.id = auth.uid()
      and viewer.role = 'admin'
      and viewer.is_active
  )
)
with check (
  exists (
    select 1
    from public.profiles as viewer
    where viewer.id = auth.uid()
      and viewer.role = 'admin'
      and viewer.is_active
  )
);

drop policy if exists "sales_delete_admin" on public.sales;
create policy "sales_delete_admin"
on public.sales
for delete
using (
  exists (
    select 1
    from public.profiles as viewer
    where viewer.id = auth.uid()
      and viewer.role = 'admin'
      and viewer.is_active
  )
);

drop policy if exists "expenses_select_owner_or_admin" on public.expenses;
create policy "expenses_select_owner_or_admin"
on public.expenses
for select
using (
  ambassador_profile_id = auth.uid()
  or exists (
    select 1
    from public.profiles as viewer
    where viewer.id = auth.uid()
      and viewer.role = 'admin'
      and viewer.is_active
  )
);

drop policy if exists "expenses_write_admin" on public.expenses;
create policy "expenses_write_admin"
on public.expenses
for all
using (
  exists (
    select 1
    from public.profiles as viewer
    where viewer.id = auth.uid()
      and viewer.role = 'admin'
      and viewer.is_active
  )
)
with check (
  exists (
    select 1
    from public.profiles as viewer
    where viewer.id = auth.uid()
      and viewer.role = 'admin'
      and viewer.is_active
  )
);

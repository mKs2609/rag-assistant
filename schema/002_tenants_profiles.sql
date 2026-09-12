create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  display_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_tenant on profiles (tenant_id);

-- used by all RLS policies
-- security definer, otherwise the profiles policy calls itself
create or replace function public.auth_tenant_id()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select tenant_id from profiles where id = auth.uid()
$$;

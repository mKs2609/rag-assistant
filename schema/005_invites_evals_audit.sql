create table if not exists tenant_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  role text not null default 'member' check (role in ('admin', 'member')),
  created_by uuid not null references profiles(id) on delete cascade,
  used_at timestamptz,
  used_by uuid references profiles(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

-- signup is rate limited by IP since there's no user yet
create table if not exists signup_rate_limits (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_signup_rate_limits_ip_created
  on signup_rate_limits (ip, created_at);

create table if not exists eval_questions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  question text not null,
  expected_document_id uuid references documents(id) on delete set null,
  expected_keywords text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid references profiles(id),
  action text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_tenant on audit_logs (tenant_id);

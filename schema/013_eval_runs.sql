-- scores used to live only in the browser, so every run was forgotten on reload and
-- there was no way to tell whether a change to retrieval helped or hurt.

create table if not exists eval_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid references profiles(id) on delete set null,
  -- null when every question errored, which is different from a genuine score of zero
  retrieval_accuracy numeric(5, 4),
  answer_accuracy numeric(5, 4),
  scored_count integer not null default 0,
  -- questions excluded because the model was unavailable, not because they failed
  skipped_count integer not null default 0,
  -- a single question can be run on its own, which should not move the trend line
  is_full_run boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_eval_runs_tenant on eval_runs (tenant_id, created_at desc);

alter table eval_runs enable row level security;

-- readable inside the workspace, and with no insert, update or delete policy those are
-- refused for everyone. runs are written by the server with the service role after a run.
drop policy if exists tenant_isolation_eval_runs on eval_runs;
create policy tenant_isolation_eval_runs on eval_runs
  for select using (tenant_id = auth_tenant_id());

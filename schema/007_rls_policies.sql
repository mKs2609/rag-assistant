alter table tenants            enable row level security;
alter table profiles           enable row level security;
alter table documents          enable row level security;
alter table document_chunks    enable row level security;
alter table conversations      enable row level security;
alter table messages           enable row level security;
alter table eval_questions     enable row level security;
alter table tenant_invites     enable row level security;
alter table audit_logs         enable row level security;
alter table signup_rate_limits enable row level security;

-- signup_rate_limits has no policies, only the service role can use it

drop policy if exists tenant_isolation_documents on documents;
create policy tenant_isolation_documents on documents
  for all using (tenant_id = auth_tenant_id())
  with check (tenant_id = auth_tenant_id());

drop policy if exists tenant_isolation_chunks on document_chunks;
create policy tenant_isolation_chunks on document_chunks
  for all using (tenant_id = auth_tenant_id())
  with check (tenant_id = auth_tenant_id());

drop policy if exists tenant_isolation_conversations on conversations;
create policy tenant_isolation_conversations on conversations
  for all using (tenant_id = auth_tenant_id())
  with check (tenant_id = auth_tenant_id());

drop policy if exists tenant_isolation_messages on messages;
create policy tenant_isolation_messages on messages
  for all using (tenant_id = auth_tenant_id())
  with check (tenant_id = auth_tenant_id());

drop policy if exists tenant_isolation_eval_questions on eval_questions;
create policy tenant_isolation_eval_questions on eval_questions
  for all using (tenant_id = auth_tenant_id())
  with check (tenant_id = auth_tenant_id());

drop policy if exists tenant_isolation_profiles on profiles;
create policy tenant_isolation_profiles on profiles
  for all using (tenant_id = auth_tenant_id())
  with check (tenant_id = auth_tenant_id());

-- audit logs are read-only for users
drop policy if exists tenant_isolation_audit_read on audit_logs;
create policy tenant_isolation_audit_read on audit_logs
  for select using (tenant_id = auth_tenant_id());

drop policy if exists tenant_isolation_tenants on tenants;
create policy tenant_isolation_tenants on tenants
  for select using (id = auth_tenant_id());

drop policy if exists tenant_owner_update on tenants;
create policy tenant_owner_update on tenants
  for update using (
    id = auth_tenant_id()
    and exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.tenant_id = tenants.id
        and profiles.role = 'owner'
    )
  )
  with check (id = auth_tenant_id());

-- invites: owners and admins only
drop policy if exists tenant_invites_select on tenant_invites;
create policy tenant_invites_select on tenant_invites
  for select using (
    tenant_id = auth_tenant_id()
    and exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = any (array['owner', 'admin'])
    )
  );

drop policy if exists tenant_invites_insert on tenant_invites;
create policy tenant_invites_insert on tenant_invites
  for insert with check (
    tenant_id = auth_tenant_id()
    and created_by = auth.uid()
    and exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = any (array['owner', 'admin'])
    )
  );

drop policy if exists tenant_invites_delete on tenant_invites;
create policy tenant_invites_delete on tenant_invites
  for delete using (
    tenant_id = auth_tenant_id()
    and exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = any (array['owner', 'admin'])
    )
  );

-- storage: first folder in the path must be the user's tenant id
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists tenant_isolation_storage_select on storage.objects;
create policy tenant_isolation_storage_select on storage.objects
  for select using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (auth_tenant_id())::text
  );

drop policy if exists tenant_isolation_storage_insert on storage.objects;
create policy tenant_isolation_storage_insert on storage.objects
  for insert with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (auth_tenant_id())::text
  );

drop policy if exists tenant_isolation_storage_delete on storage.objects;
create policy tenant_isolation_storage_delete on storage.objects
  for delete using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = (auth_tenant_id())::text
  );

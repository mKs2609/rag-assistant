-- conversations are shared in a workspace, only the creator or an owner/admin can delete one
drop policy if exists tenant_isolation_conversations on conversations;

drop policy if exists conversations_select on conversations;
create policy conversations_select on conversations
  for select using (tenant_id = auth_tenant_id());

drop policy if exists conversations_insert on conversations;
create policy conversations_insert on conversations
  for insert with check (tenant_id = auth_tenant_id() and user_id = auth.uid());

-- rename/pin are limited to the creator in the API, document scope can be changed by anyone
drop policy if exists conversations_update on conversations;
create policy conversations_update on conversations
  for update using (tenant_id = auth_tenant_id())
  with check (tenant_id = auth_tenant_id());

drop policy if exists conversations_delete on conversations;
create policy conversations_delete on conversations
  for delete using (
    tenant_id = auth_tenant_id()
    and (
      user_id = auth.uid()
      or exists (
        select 1 from profiles
        where profiles.id = auth.uid()
          and profiles.role = any (array['owner', 'admin'])
      )
    )
  );

-- who sent each message, used for the chat rate limit
alter table messages
  add column if not exists user_id uuid references profiles(id) on delete set null;

create index if not exists idx_messages_user_created on messages (user_id, created_at);

-- removing a member used to fail if they had chats, documents or audit entries.
-- keep their content in the workspace and clear the reference instead
alter table conversations alter column user_id drop not null;
alter table conversations drop constraint if exists conversations_user_id_fkey;
alter table conversations
  add constraint conversations_user_id_fkey
  foreign key (user_id) references profiles(id) on delete set null;

alter table documents alter column uploaded_by drop not null;
alter table documents drop constraint if exists documents_uploaded_by_fkey;
alter table documents
  add constraint documents_uploaded_by_fkey
  foreign key (uploaded_by) references profiles(id) on delete set null;

alter table audit_logs drop constraint if exists audit_logs_user_id_fkey;
alter table audit_logs
  add constraint audit_logs_user_id_fkey
  foreign key (user_id) references profiles(id) on delete set null;

create index if not exists idx_audit_user_action_created on audit_logs (user_id, action, created_at);

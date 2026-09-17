-- messages: anyone in the workspace can read and add, only the sender or an owner/admin can delete.
-- nothing edits messages, so there is no update policy
drop policy if exists tenant_isolation_messages on messages;

drop policy if exists messages_select on messages;
create policy messages_select on messages
  for select using (tenant_id = auth_tenant_id());

drop policy if exists messages_insert on messages;
create policy messages_insert on messages
  for insert with check (tenant_id = auth_tenant_id() and user_id = auth.uid());

drop policy if exists messages_delete on messages;
create policy messages_delete on messages
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

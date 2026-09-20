-- documents are shared in a workspace, but only the uploader or an owner/admin can delete one.
-- uploaded_by is null once a member is removed, so those can only be cleared by an owner/admin
drop policy if exists tenant_isolation_documents on documents;

drop policy if exists documents_select on documents;
create policy documents_select on documents
  for select using (tenant_id = auth_tenant_id());

drop policy if exists documents_insert on documents;
create policy documents_insert on documents
  for insert with check (tenant_id = auth_tenant_id() and uploaded_by = auth.uid());

-- status changes are written by the service role, which bypasses RLS
drop policy if exists documents_update on documents;
create policy documents_update on documents
  for update using (tenant_id = auth_tenant_id())
  with check (tenant_id = auth_tenant_id());

drop policy if exists documents_delete on documents;
create policy documents_delete on documents
  for delete using (
    tenant_id = auth_tenant_id()
    and (
      uploaded_by = auth.uid()
      or exists (
        select 1 from profiles
        where profiles.id = auth.uid()
          and profiles.role = any (array['owner', 'admin'])
      )
    )
  );

-- the file itself, otherwise a member could delete someone else's file directly
-- and leave the document row pointing at nothing.
-- supabase has used both owner and owner_id for the uploader, so pick whichever exists
drop policy if exists tenant_isolation_storage_delete on storage.objects;

do $$
declare
  uploader_column text;
begin
  select column_name into uploader_column
  from information_schema.columns
  where table_schema = 'storage' and table_name = 'objects' and column_name = 'owner_id';

  if uploader_column is null then
    uploader_column := 'owner';
  end if;

  execute format($policy$
    create policy tenant_isolation_storage_delete on storage.objects
      for delete using (
        bucket_id = 'documents'
        and (storage.foldername(name))[1] = (auth_tenant_id())::text
        and (
          %I::uuid = auth.uid()
          or exists (
            select 1 from profiles
            where profiles.id = auth.uid()
              and profiles.role = any (array['owner', 'admin'])
          )
        )
      )
  $policy$, uploader_column);
end $$;

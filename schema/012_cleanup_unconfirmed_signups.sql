-- every signup creates an account and a workspace before the email is confirmed.
-- this removes accounts that were never confirmed, and the empty workspace each one made

create or replace function public.cleanup_unconfirmed_signups(max_age interval default interval '7 days')
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  stale_ids uuid[];
  orphan_tenant_ids uuid[];
begin
  select coalesce(array_agg(id), '{}') into stale_ids
  from auth.users
  where email_confirmed_at is null
    and created_at < now() - max_age;

  if cardinality(stale_ids) = 0 then
    return 0;
  end if;

  -- only workspaces the stale user owns and nobody else has joined.
  -- an invited member who never confirmed leaves the workspace they were joining alone
  select coalesce(array_agg(p.tenant_id), '{}') into orphan_tenant_ids
  from profiles p
  where p.id = any(stale_ids)
    and p.role = 'owner'
    and not exists (
      select 1 from profiles other
      where other.tenant_id = p.tenant_id
        and other.id <> all(stale_ids)
    );

  -- removes their profiles too, through the cascade on tenant_id
  delete from tenants where id = any(orphan_tenant_ids);

  -- profiles cascade from auth.users as well, for members who joined an existing workspace
  delete from auth.users where id = any(stale_ids);

  return cardinality(stale_ids);
end;
$$;

-- security definer bypasses RLS, so nobody may call this through the API
revoke execute on function public.cleanup_unconfirmed_signups(interval) from public, anon, authenticated;

-- run it every night at 03:00 UTC
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'cleanup-unconfirmed-signups',
  '0 3 * * *',
  $$select public.cleanup_unconfirmed_signups()$$
);

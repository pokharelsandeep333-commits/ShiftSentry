-- Keep each shift bound to one of the signed-in user's jobs, even when a
-- caller bypasses the application and talks to PostgREST directly.
drop policy if exists "users manage own shifts" on public.shifts;

create policy "users manage own shifts" on public.shifts
  for all
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.jobs
      where jobs.id = shifts.job_id
        and jobs.user_id = (select auth.uid())
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.jobs
      where jobs.id = shifts.job_id
        and jobs.user_id = (select auth.uid())
    )
  );

-- These functions are used by triggers/event triggers, not by the REST RPC
-- API. Removing PUBLIC execution prevents direct calls through exposed schema.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;

-- Cover the audit-event foreign keys and match the Prisma model's expected
-- target-user/time index.
create index if not exists audit_events_actor_created_idx
  on public.audit_events (actor_id, created_at desc);

create index if not exists audit_events_target_user_created_idx
  on public.audit_events (target_user_id, created_at desc);

-- One round trip for what every signed-in page needs before its own data:
-- the caller's profile and whether they hold the current agreement.
--
-- A page change made three Supabase calls in a row: the proxy's
-- has_current_legal_acceptance, then requireUser()'s profile read, then the
-- page's data. Each is ~1 ms of database work and ~80-110 ms of network, so
-- the chain, not the queries, was the cost. The proxy now calls this instead
-- and hands the result to the page, which skips both of its own reads.
--
-- Nothing is widened: the profile is the caller's own row (what RLS already
-- returns to them), `accepted` is exactly has_current_legal_acceptance(), and
-- the require_current_legal_agreement trigger still refuses every write from
-- a user without the current agreement.

create function public.get_session_context() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'accepted', public.has_current_legal_acceptance(),
    'profile', (
      select to_jsonb(p) from (
        select id, email, display_name, role, time_zone, week_starts_on,
               global_weekly_limit_minutes, disabled_at, deletion_pending_at
          from public.profiles
         where id = (select auth.uid())
      ) p
    )
  );
$$;

comment on function public.get_session_context() is
  'The caller''s own profile and whether they accepted the current agreement, in one call. Read by src/proxy.ts.';

revoke execute on function public.get_session_context() from public, anon;
grant execute on function public.get_session_context() to authenticated;

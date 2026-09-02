-- The shift log numbers each week that holds at least one shift, starting from
-- the week of the earliest shift ever logged, with no gaps for weeks off. That
-- anchoring means the number of any week depends on every week before it.
--
-- The page used to satisfy that by selecting `starts_at` for every shift the
-- user had ever logged, on every page view, and de-duplicating the weeks in
-- TypeScript. Correct, but it transferred and parsed the user's entire history
-- to derive about eight labels, and grew linearly forever.
--
-- Only one number is actually missing: how many distinct weeks hold a shift
-- strictly before the loaded window. The weeks inside the window are already in
-- hand, so they can be numbered upward from it. This returns that single
-- integer, and the count(distinct ...) happens next to the data instead of
-- across the wire.
--
-- The week-start expression is copied verbatim from enforce_shift_weekly_limits
-- in 202608250004_business_rule_integrity.sql. It must stay identical to that
-- trigger and to weekStartFor() in src/lib/time.ts -- three places, one rule.
--
-- security invoker (the default, stated for the reader) so the "users manage
-- own shifts" RLS policy scopes the count to the caller. The function therefore
-- takes no user id: it cannot be pointed at somebody else's history.

create or replace function public.shift_week_count_before(
  p_time_zone text,
  p_week_starts_on integer,
  p_before timestamptz
) returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(distinct
    (s.starts_at at time zone p_time_zone)::date
      - ((extract(dow from (s.starts_at at time zone p_time_zone))::integer - p_week_starts_on + 7) % 7)
  )::integer
  from public.shifts s
  where s.starts_at < p_before;
$$;

comment on function public.shift_week_count_before(text, integer, timestamptz) is
  'Distinct weeks holding at least one of the calling user''s shifts that start before the cutoff. Used to number the shift log without shipping every row.';

-- Postgres grants execute to PUBLIC on every new function; anon has no reason
-- to call this one.
revoke execute on function public.shift_week_count_before(text, integer, timestamptz) from public;
grant execute on function public.shift_week_count_before(text, integer, timestamptz) to authenticated;

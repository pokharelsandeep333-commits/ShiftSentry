-- A pay schedule per job, so the dashboard can show the pay period in progress
-- ("Oct 15 - Oct 28, $212 so far") the way the employer will actually pay it.
--
-- Two shapes cover the schedules seen so far:
--   every_n_weeks  every 1-4 weeks, phased by pay_anchor_date, any local date a
--                  period starts on (a biweekly Thursday-to-Thursday payroll
--                  needs to know *which* Thursdays).
--   monthly_day    from day pay_month_day of one month to the same day of the
--                  next (the 21st to the 21st). Days 29-31 fall back to the last
--                  day of a shorter month; src/lib/pay-period.ts does the math.
--
-- This is a rule, not a list of periods: payPeriodFor() derives any period from
-- it. Nothing here changes what a shift is worth or whether it is allowed, so
-- there is no trigger counterpart -- the earnings snapshot and the weekly caps
-- are untouched. The shape check only keeps the columns coherent for any
-- PostgREST write that skips the app.
--
-- text + check rather than an enum, so a later shape (semi-monthly) is a
-- constraint swap instead of an ALTER TYPE that cannot be used in the migration
-- that adds it. Adding nullable columns and a constant default is a catalog-only
-- change, so existing rows are not rewritten.

alter table public.jobs
  add column pay_schedule text not null default 'none',
  add column pay_interval_weeks smallint,
  add column pay_anchor_date date,
  add column pay_month_day smallint,
  add column payday_offset_days smallint,
  add constraint jobs_pay_schedule_kind check (pay_schedule in ('none', 'every_n_weeks', 'monthly_day')),
  add constraint jobs_pay_interval_weeks_range check (pay_interval_weeks between 1 and 4),
  add constraint jobs_pay_month_day_range check (pay_month_day between 1 and 31),
  add constraint jobs_payday_offset_range check (payday_offset_days between 0 and 31),
  add constraint jobs_pay_schedule_shape check (
    (pay_schedule = 'none'
      and pay_interval_weeks is null and pay_anchor_date is null and pay_month_day is null and payday_offset_days is null)
    or (pay_schedule = 'every_n_weeks'
      and pay_interval_weeks is not null and pay_anchor_date is not null and pay_month_day is null)
    or (pay_schedule = 'monthly_day'
      and pay_month_day is not null and pay_interval_weeks is null and pay_anchor_date is null)
  );

comment on column public.jobs.pay_schedule is
  'none | every_n_weeks | monthly_day. Periods are derived in src/lib/pay-period.ts, half-open over local dates.';
comment on column public.jobs.pay_anchor_date is
  'Any local date an every_n_weeks period starts on; fixes which weeks the cycle falls on.';
comment on column public.jobs.payday_offset_days is
  'Optional: days after a period''s last day that it is paid, for the dashboard''s payday estimate.';

-- The account export names every column it returns, so the new ones have to be
-- added here or a user's download would silently omit their pay schedule.
-- Unchanged otherwise from 20261012002439_legal_account_privacy.sql.
create or replace function public.export_account_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); result jsonb;
begin
  if actor is null or not exists(select 1 from public.profiles where id = actor) then raise exception 'Sign in to export your account.'; end if;
  select jsonb_build_object(
    'schemaVersion', 1, 'exportedAt', now(),
    'profile', (select to_jsonb(p) from (select id,email,display_name,role,time_zone,week_starts_on,global_weekly_limit_minutes,disabled_at,deletion_pending_at,created_at,updated_at from public.profiles where id = actor) p),
    'jobs', coalesce((select jsonb_agg(to_jsonb(j) order by j.id) from (select id,user_id,name,color,weekly_limit_minutes,hourly_rate_cents,tax_rate_basis_points,archived_at,google_keyword,google_calendar_id,google_sync,google_sync_ignored,pay_schedule,pay_interval_weeks,pay_anchor_date,pay_month_day,payday_offset_days,created_at,updated_at from public.jobs where user_id = actor) j),'[]'::jsonb),
    'deductions', coalesce((select jsonb_agg(to_jsonb(d) order by d.id) from (select d.id,d.job_id,d.name,d.rate_basis_points,d.created_at,d.updated_at from public.job_deductions d join public.jobs j on j.id = d.job_id where j.user_id = actor) d),'[]'::jsonb),
    'shifts', coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from (select id,user_id,job_id,starts_at,ends_at,notes,hourly_rate_cents,tax_rate_basis_points,deductions_snapshot,gross_cents,tax_cents,deduction_cents,net_cents,google_calendar_id,google_event_id,google_adopted,created_at,updated_at from public.shifts where user_id = actor) s),'[]'::jsonb),
    'weekNotes', coalesce((select jsonb_agg(to_jsonb(n) order by n.week_start) from (select id,user_id,week_start,body,created_at,updated_at from public.week_notes where user_id = actor) n),'[]'::jsonb),
    'agreements', coalesce((select jsonb_agg(to_jsonb(a) order by a.accepted_at) from (select version,accepted_at from public.legal_acceptances where user_id = actor) a),'[]'::jsonb),
    'calendarSettings', (select to_jsonb(c) from (select google_email,scopes,selected_calendar_ids,status,created_at,updated_at from public.google_calendar_connections where user_id = actor) c),
    'gameMemberships', coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from (select id,room_id,display_name,joined_at,last_seen_at from public.game_room_players where user_id = actor) m),'[]'::jsonb),
    'gameParticipation', coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from (select id,round_id,turn_order,eliminated_at from public.game_round_players where user_id = actor) p),'[]'::jsonb),
    'gameClues', coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from (select id,round_id,pass_no,clue,created_at from public.game_clues where user_id = actor) c),'[]'::jsonb),
    'gameVotes', coalesce((select jsonb_agg(to_jsonb(v) order by v.id) from (select id,round_id,target_id,created_at from public.game_votes where voter_id = actor) v),'[]'::jsonb),
    'hostedRooms', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from (select id,status,decoy_mode,category_hint,imposter_final_guess,imposter_count,clue_passes,max_players,category_filter,imposter_hint,hide_roles,ban_repeat_clues,discussion_phase,word_difficulty,created_at,updated_at,ended_at from public.game_rooms where host_id = actor) r),'[]'::jsonb),
    'gameFinalGuesses', coalesce((select jsonb_agg(to_jsonb(g) order by g.id) from (select id,final_guess,ended_at from public.game_rounds where caught_user_id = actor and final_guess is not null) g),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke execute on function public.export_account_data() from public, anon;
grant execute on function public.export_account_data() to authenticated;

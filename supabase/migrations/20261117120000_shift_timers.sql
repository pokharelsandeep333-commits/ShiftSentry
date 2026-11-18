-- Clock in / clock out: a running timer per user.
--
-- A timer is a shift that has started and not yet ended: which job, and the
-- instant the person clocked in. It is a server row rather than browser
-- storage so it survives a reload, a closed tab and a change of device -- clock
-- in on the phone at the start of a shift, clock out on a laptop at the end.
--
-- Stopping a timer is not done here. The app's stop action turns the timer into
-- an ordinary shift insert, so every shift rule (the 24-hour ceiling, weekly
-- caps, the pay snapshot, no overlap, no duplicate span) is enforced by the
-- same triggers and constraints as a typed-in shift, and only then deletes the
-- timer. Nothing about a timer can put a shift into the table on its own.
--
-- Clocking in during a shift already logged for that time (a scheduled shift,
-- or one starting within the next half hour) adopts it: `shift_id` names that
-- shift, and the stop action updates its start and end to the real ones
-- through the ordinary shift update, where the same triggers apply and the pay
-- snapshot is kept as for any edit that keeps the job. Without adoption the
-- timer could only ever end in a shift that overlaps the scheduled one, which
-- shifts_no_overlap refuses. If the adopted shift is deleted meanwhile, the
-- timer falls back to logging a new shift (ON DELETE SET NULL).
--
-- What this table does enforce:
-- * One timer per user: user_id is the primary key, so a second device's
--   "Start" is refused rather than starting a parallel clock.
-- * The clock-in instant is the database's, not the client's: the insert
--   trigger overwrites started_at with now(). A PostgREST caller cannot plant a
--   timer that "started" yesterday to log hours nobody watched being worked.
-- * The job is one of the caller's own active jobs, mirroring the check
--   startShiftTimer makes. An adopted shift is the caller's own, on that same
--   job, and not already over.
-- * A timer is never edited, only started and stopped or discarded: there is
--   no UPDATE grant. Fixing the times goes through the shift editor, whose
--   save is the ordinary shift insert.

create table public.shift_timers (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  -- Deleting a job (only possible once archived and empty) takes its timer.
  job_id uuid not null references public.jobs(id) on delete cascade,
  started_at timestamptz not null default now(),
  shift_id uuid references public.shifts(id) on delete set null
);

-- Serve the ON DELETE lookups from jobs and shifts.
create index shift_timers_job on public.shift_timers (job_id);
create index shift_timers_shift on public.shift_timers (shift_id);

comment on table public.shift_timers is
  'At most one running clock-in per user. Stopping it inserts an ordinary shift; the timer itself never becomes one.';

create function public.prepare_shift_timer() returns trigger
language plpgsql set search_path = '' as $$
declare job_archived_at timestamptz;
begin
  new.started_at := now();
  -- Read as the caller, so RLS on jobs already hides anyone else's; the
  -- user_id match covers a write with no user claim.
  select archived_at into job_archived_at from public.jobs where id = new.job_id and user_id = new.user_id;
  if not found or job_archived_at is not null then
    raise exception 'Choose one of your active jobs.' using errcode = '23514';
  end if;
  if new.shift_id is not null and not exists (
    select 1 from public.shifts
    where id = new.shift_id and user_id = new.user_id and job_id = new.job_id and ends_at > new.started_at
  ) then
    raise exception 'That shift cannot be clocked into.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke execute on function public.prepare_shift_timer() from public, anon, authenticated;

create trigger shift_timers_prepare before insert on public.shift_timers
  for each row execute function public.prepare_shift_timer();

-- The same agreement and account-state guard as every other table of personal
-- data (20261012002439).
create trigger require_current_legal_agreement before insert or update or delete on public.shift_timers
  for each row execute function public.require_legal_write();

alter table public.shift_timers enable row level security;

revoke all on public.shift_timers from public, anon, authenticated;
grant select, insert, delete on public.shift_timers to authenticated;

create policy "users read their own timer" on public.shift_timers
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "users start their own timer" on public.shift_timers
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "users stop their own timer" on public.shift_timers
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Same lock-out as jobs, shifts, deductions and week notes: a token issued
-- before the ban still reaches PostgREST until it expires.
create policy "disabled accounts are locked out of timers" on public.shift_timers
  as restrictive for all to authenticated
  using ((select public.is_account_enabled()))
  with check ((select public.is_account_enabled()));

-- ---------------------------------------------------------------------------
-- The export gains shiftTimer (null when nothing is running). Unchanged
-- otherwise from 20261016120000_admin_support_tools.sql.
-- ---------------------------------------------------------------------------
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
    'shiftTimer', (select to_jsonb(t) from (select job_id,started_at,shift_id from public.shift_timers where user_id = actor) t),
    'weekNotes', coalesce((select jsonb_agg(to_jsonb(n) order by n.week_start) from (select id,user_id,week_start,body,created_at,updated_at from public.week_notes where user_id = actor) n),'[]'::jsonb),
    'agreements', coalesce((select jsonb_agg(to_jsonb(a) order by a.accepted_at) from (select version,accepted_at from public.legal_acceptances where user_id = actor) a),'[]'::jsonb),
    'calendarSettings', (select to_jsonb(c) from (select google_email,scopes,selected_calendar_ids,status,created_at,updated_at from public.google_calendar_connections where user_id = actor) c),
    'gameMemberships', coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from (select id,room_id,display_name,joined_at,last_seen_at from public.game_room_players where user_id = actor) m),'[]'::jsonb),
    'gameParticipation', coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from (select id,round_id,turn_order,eliminated_at from public.game_round_players where user_id = actor) p),'[]'::jsonb),
    'gameClues', coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from (select id,round_id,pass_no,clue,created_at from public.game_clues where user_id = actor) c),'[]'::jsonb),
    'gameVotes', coalesce((select jsonb_agg(to_jsonb(v) order by v.id) from (select id,round_id,target_id,created_at from public.game_votes where voter_id = actor) v),'[]'::jsonb),
    'hostedRooms', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from (select id,status,decoy_mode,category_hint,imposter_final_guess,imposter_count,clue_passes,max_players,category_filter,imposter_hint,hide_roles,ban_repeat_clues,discussion_phase,word_difficulty,created_at,updated_at,ended_at from public.game_rooms where host_id = actor) r),'[]'::jsonb),
    'gameFinalGuesses', coalesce((select jsonb_agg(to_jsonb(g) order by g.id) from (select id,final_guess,ended_at from public.game_rounds where caught_user_id = actor and final_guess is not null) g),'[]'::jsonb),
    'supportNotes', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at) from (select id,body,created_at from public.admin_user_notes where user_id = actor) s),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke execute on function public.export_account_data() from public, anon;
grant execute on function public.export_account_data() to authenticated;

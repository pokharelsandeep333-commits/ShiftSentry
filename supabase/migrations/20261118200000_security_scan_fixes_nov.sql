-- Fixes from the 2026-11-18 security scan (main at 7e691fa).
--
-- 1. export_account_data() gets a budget at the database. The download route
--    limits a user to three exports a minute, but the RPC is granted to
--    `authenticated`, so a session could call it directly as often as it
--    liked, each call aggregating the caller's whole account. The same budget
--    now holds in the function itself, kept in a table no API role can touch
--    (as google_sync_claims does for the sync). Calls inside one transaction
--    count once: one PostgREST request is one transaction, so this changes
--    nothing for a real caller.
-- 2. A round the host cancelled is ENDED with no outcome. game_round_reveal and
--    the ballot policy treated every ENDED round as revealed, so players still
--    in the room could read the imposters, the word and partial ballots of a
--    round that never reached its reveal. Every path into REVEAL sets an
--    outcome, so "revealed" now means "has an outcome".
-- 3. rename_game_player wrote the name even when it had not changed, and the
--    column trigger broadcast that write to the whole room, whose visible
--    clients each refreshed. An unchanged name is no longer written.
-- 4. audit.exported events stored the raw account id used as the actor filter
--    in metadata, where account deletion's cleanup (which matches actor_id and
--    target_user_id) could not find it. The app now records only whether the
--    filter was used; existing rows are scrubbed the same way, and the cleanup
--    also strips any id left in metadata.actor.

-- ---------------------------------------------------------------------------
-- 1. Export budget
-- ---------------------------------------------------------------------------

create table public.account_export_claims (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  window_started_at timestamptz not null,
  used smallint not null check (used between 1 and 3),
  last_xact xid8 not null
);

comment on table public.account_export_claims is
  'Each user''s account-export budget: three exports per minute. Written only by export_account_data.';

alter table public.account_export_claims enable row level security;

-- No policies on purpose: only the security definer function below reads or
-- writes this table.
revoke all on public.account_export_claims from public, anon, authenticated;

create or replace function public.export_account_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); result jsonb;
begin
  if actor is null or not exists(select 1 from public.profiles where id = actor) then raise exception 'Sign in to export your account.'; end if;

  -- One statement, so two parallel requests cannot both take the last export.
  -- A new minute starts a fresh window; the same transaction is not counted
  -- twice. SQLSTATE PT429 makes PostgREST answer HTTP 429.
  insert into public.account_export_claims as claim (user_id, window_started_at, used, last_xact)
  values (actor, now(), 1, pg_current_xact_id())
  on conflict (user_id) do update set
    used = case
      when claim.last_xact = excluded.last_xact then claim.used
      when claim.window_started_at <= now() - interval '1 minute' then 1
      else claim.used + 1 end,
    window_started_at = case
      when claim.last_xact <> excluded.last_xact and claim.window_started_at <= now() - interval '1 minute' then now()
      else claim.window_started_at end,
    last_xact = excluded.last_xact
  where claim.last_xact = excluded.last_xact
     or claim.window_started_at <= now() - interval '1 minute'
     or claim.used < 3;
  if not found then
    raise exception 'Too many downloads. Wait a minute and try again.' using errcode = 'PT429';
  end if;

  select jsonb_build_object(
    'schemaVersion', 1, 'exportedAt', now(),
    'profile', (select to_jsonb(p) from (select id,email,display_name,role,time_zone,week_starts_on,global_weekly_limit_minutes,disabled_at,deletion_pending_at,created_at,updated_at from public.profiles where id = actor) p),
    'jobs', coalesce((select jsonb_agg(to_jsonb(j) order by j.id) from (select id,user_id,name,color,weekly_limit_minutes,hourly_rate_cents,tax_rate_basis_points,archived_at,google_keyword,google_calendar_id,google_sync,google_sync_ignored,pay_schedule,pay_interval_weeks,pay_anchor_date,pay_month_day,payday_offset_days,created_at,updated_at from public.jobs where user_id = actor) j),'[]'::jsonb),
    'deductions', coalesce((select jsonb_agg(to_jsonb(d) order by d.id) from (select d.id,d.job_id,d.name,d.rate_basis_points,d.created_at,d.updated_at from public.job_deductions d join public.jobs j on j.id = d.job_id where j.user_id = actor) d),'[]'::jsonb),
    'shifts', coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from (select id,user_id,job_id,starts_at,ends_at,notes,hourly_rate_cents,tax_rate_basis_points,deductions_snapshot,gross_cents,tax_cents,deduction_cents,net_cents,google_calendar_id,google_event_id,google_adopted,created_at,updated_at from public.shifts where user_id = actor) s),'[]'::jsonb),
    'shiftTimer', (select to_jsonb(t) from (select job_id,started_at,shift_id from public.shift_timers where user_id = actor) t),
    'breakPeriods', coalesce((select jsonb_agg(to_jsonb(b) order by b.start_date) from (select id,user_id,start_date,end_date,weekly_limit_minutes,label,created_at,updated_at from public.break_periods where user_id = actor) b),'[]'::jsonb),
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

-- ---------------------------------------------------------------------------
-- 2. A cancelled round is not a revealed one
-- ---------------------------------------------------------------------------

create or replace function public.game_round_reveal(p_round_id uuid)
returns table (word text, decoy_word text, category text, imposter_ids uuid[])
language sql
stable
security definer
set search_path = ''
as $$
  select
    game_words.word,
    game_words.decoy_word,
    game_words.category,
    array(
      select user_id from public.game_round_secrets
      where round_id = p_round_id and role = 'IMPOSTER'
    )
  from public.game_rounds
  join public.game_words on game_words.id = game_rounds.word_id
  where game_rounds.id = p_round_id
    and game_rounds.status in ('REVEAL', 'ENDED')
    and game_rounds.outcome is not null
    and public.is_game_room_member(game_rounds.room_id);
$$;

comment on function public.game_round_reveal(uuid) is
  'The round''s word, decoy, category and imposters. Returns nothing until the round reaches REVEAL, and never for a round ended without an outcome.';

drop policy if exists "votes stay secret until the reveal" on public.game_votes;

create policy "votes stay secret until the reveal" on public.game_votes
  for select using (
    (select auth.uid()) = voter_id
    or exists (
      select 1
      from public.game_rounds
      where game_rounds.id = game_votes.round_id
        and (game_rounds.status = 'GUESSING'
             or (game_rounds.status in ('REVEAL', 'ENDED') and game_rounds.outcome is not null))
        and public.is_game_room_member(game_rounds.room_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 3. An unchanged name is not written (so it is not broadcast)
-- ---------------------------------------------------------------------------

create or replace function public.rename_game_player(p_room_id uuid, p_display_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  seat_name text := left(nullif(btrim(p_display_name), ''), 40);
begin
  if actor is null then
    raise exception 'You must be signed in to rename yourself.';
  end if;

  if seat_name is null then
    raise exception 'Enter a name.';
  end if;

  if not exists (
    select 1
      from public.game_room_players seat
      join public.game_rooms room on room.id = seat.room_id
     where seat.room_id = p_room_id
       and seat.user_id = actor
       and room.status <> 'ENDED'
  ) then
    raise exception 'You are not in that game.';
  end if;

  update public.game_room_players seat
     set display_name = seat_name
    from public.game_rooms room
   where seat.room_id = p_room_id
     and seat.user_id = actor
     and room.id = seat.room_id
     and room.status <> 'ENDED'
     and seat.display_name is distinct from seat_name;
end;
$$;

comment on function public.rename_game_player(uuid, text) is
  'Changes the caller''s own seat name in a live room. Nobody can rename anyone else. An unchanged name writes nothing.';

revoke execute on function public.rename_game_player(uuid, text) from public, anon;
grant execute on function public.rename_game_player(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. No account ids in audit metadata
-- ---------------------------------------------------------------------------

update public.audit_events
   set metadata = (metadata - 'actor')
       || jsonb_build_object('actorFiltered', coalesce(metadata ->> 'actor', '') <> '')
 where action = 'audit.exported'
   and metadata ? 'actor';

create or replace function public.cleanup_deleted_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
declare membership record;
begin
  -- Settle a departing non-host's turn, ballot, or pending guess before FK
  -- cascades remove their seat. Hosted rooms deliberately remain owned until
  -- the profile cascade deletes them, as explained in the confirmation.
  for membership in select r.id from public.game_rooms r join public.game_room_players p on p.room_id = r.id
    where p.user_id = old.id and r.host_id <> old.id order by r.id loop
    perform public.depart_game_room(membership.id, old.id);
  end loop;
  delete from public.shifts where user_id = old.id;
  update public.game_rounds set final_guess = null where caught_user_id = old.id;
  -- An id kept only in metadata (an old audit export's actor filter) is not
  -- matched by the columns below.
  update public.audit_events set metadata = metadata - 'actor'
    where metadata ->> 'actor' = old.id::text;
  update public.audit_events set metadata = case when metadata ? 'authBanApplied'
    then jsonb_build_object('authBanApplied', metadata -> 'authBanApplied') else '{}'::jsonb end
    where actor_id = old.id or target_user_id = old.id;
  return old;
end;
$$;
revoke execute on function public.cleanup_deleted_profile() from public, anon, authenticated;

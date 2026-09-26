-- Fixes for the six findings of the 2026-09-26 security scan. Each section
-- names the finding it closes; the suites 11-14 in supabase/tests pin them.
--
--   1. The word draw is internal. `authenticated` could call draw_game_word
--      directly mid-round and enumerate the room's unused word ids.
--   2. The compensation ceiling is serialised per job. Two deductions added at
--      once could each pass against a total that included neither.
--   3. A join re-reads the room inside its lock. A join queued behind
--      start_game_round could seat itself in a room that was already playing.
--   4. Leaving a room means leaving the round. A kicked player kept their vote,
--      their secret (including a re-rolled one) and, when caught, the guess.
--   5. A disabled account is locked out at the database, not only by the
--      Next.js redirect. Its access token outlives the Auth ban by up to an
--      hour, and PostgREST accepts it for that whole time.

-- ---------------------------------------------------------------------------
-- 1. The word draw is internal
-- ---------------------------------------------------------------------------
--
-- The foundation migration's header already says only the security definer
-- draw function may read the word bank or the used-word list -- but the
-- function itself was granted to `authenticated`, and it returns the id it
-- drew. A host calling it in a loop during PLAYING collects every unused id in
-- the pool; cross-referenced with ids learned at earlier reveals, the one
-- missing is the answer. Burning words that way also empties the pool on
-- purpose.
--
-- Its only legitimate callers are start_game_round and reroll_game_word, both
-- security definer, which run as the owner and so keep EXECUTE through it.
revoke execute on function public.draw_game_word(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The compensation ceiling, serialised per job
-- ---------------------------------------------------------------------------
--
-- Same shape as the weekly-limit lock in enforce_shift_weekly_limits: take a
-- transaction lock before summing. Under READ COMMITTED each later statement
-- in the function reads a fresh snapshot, so it sees whatever the previous
-- holder committed. Both branches lock the same key, so a tax change on the
-- job and a deduction added to it serialise against each other too.
--
-- The key is prefixed so it cannot share a slot with the per-user shift lock
-- or the per-room game locks, which hash bare uuids.
create or replace function public.enforce_job_compensation_rate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  job_tax_rate integer;
  deduction_rate integer;
begin
  -- Two branches rather than one lock above them: the trigger fires on two
  -- tables, and a reference to new.job_id fails outright on a jobs row.
  if tg_table_name = 'jobs' then
    perform pg_advisory_xact_lock(hashtext('job_compensation:' || new.id::text));

    select coalesce(sum(rate_basis_points), 0)
      into deduction_rate
      from public.job_deductions
      where job_id = new.id;

    if new.tax_rate_basis_points + deduction_rate > 10000 then
      raise exception 'Tax and deductions together cannot exceed 100%%.';
    end if;
  else
    perform pg_advisory_xact_lock(hashtext('job_compensation:' || new.job_id::text));

    select tax_rate_basis_points
      into job_tax_rate
      from public.jobs
      where id = new.job_id;

    if job_tax_rate is null then
      raise exception 'Job not found.';
    end if;

    select coalesce(sum(rate_basis_points), 0)
      into deduction_rate
      from public.job_deductions
      where job_id = new.job_id
        and id is distinct from new.id;

    if job_tax_rate + deduction_rate + new.rate_basis_points > 10000 then
      raise exception 'Tax and deductions together cannot exceed 100%%.';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. A join re-reads the room inside its lock
-- ---------------------------------------------------------------------------
--
-- The lobby check used to run before the lock. start_game_round holds that same
-- lock while it seats the roster, so a join arriving mid-deal read LOBBY, queued,
-- and inserted once the deal committed: a member of a room already playing, with
-- no seat in the round but every membership-gated read. The code lookup still
-- has to come first -- the lock is keyed by the room id the code resolves to --
-- but status and capacity are now read again once the lock is held.
create or replace function public.join_game_room(
  p_code text,
  p_display_name text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  explicit_name text := left(nullif(btrim(p_display_name), ''), 40);
  seat_name text;
  found_room_id uuid;
  target_room record;
  seated integer;
begin
  if actor is null then
    raise exception 'You must be signed in to join a game.';
  end if;

  select coalesce(
    explicit_name,
    nullif(btrim(profiles.display_name), ''),
    split_part(profiles.email, '@', 1)
  )
  into seat_name
  from public.profiles
  where profiles.id = actor;

  if seat_name is null then
    raise exception 'Your profile is not ready yet. Reload and try again.';
  end if;

  seat_name := left(seat_name, 40);

  select id
    into found_room_id
    from public.game_rooms
    where code = upper(btrim(p_code))
      and status = 'LOBBY';

  if not found then
    raise exception 'That code does not match a game that is waiting for players.';
  end if;

  -- Serialise joins for this room so two players cannot both read a seat count
  -- below the cap and both take the last seat -- and so a join cannot land in
  -- the middle of a deal.
  perform pg_advisory_xact_lock(hashtext(found_room_id::text));

  select id, code, status, max_players
    into target_room
    from public.game_rooms
    where id = found_room_id;

  if target_room.status <> 'LOBBY' then
    raise exception 'That code does not match a game that is waiting for players.';
  end if;

  select count(*)
    into seated
    from public.game_room_players
    where room_id = target_room.id;

  if seated >= target_room.max_players
     and not exists (
       select 1
       from public.game_room_players
       where room_id = target_room.id
         and user_id = actor
     ) then
    raise exception 'That game is full.';
  end if;

  insert into public.game_room_players (room_id, user_id, display_name)
  values (target_room.id, actor, seat_name)
  on conflict (room_id, user_id)
  do update set
    -- A name you chose in the lobby survives re-opening the invite link. Only
    -- an explicit name overrides it.
    display_name = coalesce(explicit_name, public.game_room_players.display_name),
    last_seen_at = now();

  return target_room.code;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Leaving a room means leaving the round
-- ---------------------------------------------------------------------------
--
-- A departed player's round seat is kept on purpose -- their clues still need a
-- name -- and the turn order already stepped over them. Nothing else did. The
-- vote checked the round seat, not the room; the secret function checked only
-- that the row was yours; the final guess checked only caught_user_id. So a
-- kicked player could keep voting, read the crew word after the host re-rolled
-- it (the re-roll exists precisely for a word someone should not have seen), and
-- steal the round with a guess from outside the room.
--
-- Current room membership is now required at each of those three points. And
-- departure itself -- leaving, being kicked, or being disabled -- goes through
-- one function that also settles what the player leaves behind:
--
--   Ballots cast by them, or for them, in a live vote are withdrawn. A ballot
--   for somebody no longer in the room cannot eliminate anyone meaningfully, and
--   one from somebody no longer playing should not decide the round. Whoever
--   voted for the departed player shows as not having voted, and votes again.
--
--   If that leaves every remaining player with a ballot in, the round resolves
--   there and then, rather than waiting for someone to re-send a vote they have
--   already cast.
--
--   A caught imposter who walks away during GUESSING forfeits the guess, and the
--   crew win. Otherwise the round would sit in GUESSING until the host abandoned
--   it, scoring for nobody.
create or replace function public.depart_game_room(p_room_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  room_host uuid;
  successor uuid;
  live record;
  active integer;
  ballots integer;
begin
  -- Taken before the room is read, not after: two players leaving at once must
  -- serialise, and the host check below has to be made against the host as it
  -- is inside the lock.
  perform pg_advisory_xact_lock(hashtext(p_room_id::text));

  select host_id into room_host
    from public.game_rooms
    where id = p_room_id
      and status <> 'ENDED';

  if not found then
    return;
  end if;

  delete from public.game_room_players
   where room_id = p_room_id
     and user_id = p_user_id;

  if not found then
    return;
  end if;

  -- Only a vote or a pending guess holds anything of theirs that still matters.
  -- A clue phase needs nothing: the turn order already skips departed seats.
  select id into live
    from public.game_rounds
    where room_id = p_room_id
      and status in ('VOTING', 'GUESSING')
    order by round_no desc
    limit 1;

  if found then
    -- The lock submit_game_vote and submit_game_final_guess take, so a ballot
    -- cannot land between the clean-up and the count. Always room then round;
    -- nothing takes them in the other order at these statuses.
    perform pg_advisory_xact_lock(hashtext(live.id::text));

    select id, status, caught_user_id
      into live
      from public.game_rounds
      where id = live.id;

    if live.status = 'VOTING' then
      delete from public.game_votes
       where round_id = live.id
         and (voter_id = p_user_id or target_id = p_user_id);

      select count(*) into active
        from public.game_round_players seat
        where seat.round_id = live.id
          and seat.eliminated_at is null
          and exists (
            select 1 from public.game_room_players member
            where member.room_id = p_room_id and member.user_id = seat.user_id
          );

      select count(*) into ballots
        from public.game_votes
        where round_id = live.id;

      if active > 0 and ballots >= active then
        perform public.resolve_game_round(live.id);
      end if;
    elsif live.status = 'GUESSING' and live.caught_user_id = p_user_id then
      update public.game_rounds
         set status = 'REVEAL', outcome = 'CREW_WIN', ended_at = now()
       where id = live.id;
    end if;
  end if;

  if room_host <> p_user_id then
    return;
  end if;

  select user_id into successor
    from public.game_room_players
    where room_id = p_room_id
    order by joined_at, user_id
    limit 1;

  if successor is null then
    update public.game_rooms
       set status = 'ENDED', ended_at = now()
     where id = p_room_id;
  else
    update public.game_rooms
       set host_id = successor
     where id = p_room_id;
  end if;
end;
$$;

comment on function public.depart_game_room(uuid, uuid) is
  'Internal. Removes a player from a room and settles what they leave behind: their live ballots, a pending guess, the host role.';

create or replace function public.leave_game_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then
    raise exception 'You must be signed in.';
  end if;

  perform public.depart_game_room(p_room_id, actor);
end;
$$;

create or replace function public.kick_game_player(p_room_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then
    raise exception 'You must be signed in.';
  end if;

  if p_user_id = actor then
    raise exception 'Use Leave game to remove yourself.';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_room_id::text));

  if not exists (
    select 1 from public.game_rooms
    where id = p_room_id and host_id = actor and status <> 'ENDED'
  ) then
    raise exception 'Only the host can remove a player.';
  end if;

  perform public.depart_game_room(p_room_id, p_user_id);
end;
$$;

comment on function public.kick_game_player(uuid, uuid) is
  'Host-only. Removes a player from the room; their round seat and clues remain, their ballot and any say in the round do not.';

create or replace function public.submit_game_vote(p_round_id uuid, p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  round record;
  active integer;
  cast_votes integer;
begin
  if actor is null then
    raise exception 'You must be signed in.';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_round_id::text));

  select id, room_id, status into round
    from public.game_rounds where id = p_round_id;

  if not found or round.status <> 'VOTING' then
    raise exception 'This round is not taking votes.';
  end if;

  -- The round seat outlives a departure, so it alone does not prove somebody is
  -- still playing. Both ends of the ballot have to be in the room now.
  if not public.is_game_room_member(round.room_id)
     or not exists (
       select 1 from public.game_round_players
       where round_id = p_round_id and user_id = actor and eliminated_at is null
     ) then
    raise exception 'You are not voting in this round.';
  end if;

  if not exists (
    select 1 from public.game_round_players seat
    where seat.round_id = p_round_id
      and seat.user_id = p_target_id
      and seat.eliminated_at is null
      and exists (
        select 1 from public.game_room_players member
        where member.room_id = round.room_id and member.user_id = seat.user_id
      )
  ) then
    raise exception 'That player is not in this round.';
  end if;

  if p_target_id = actor then
    raise exception 'You cannot vote for yourself.';
  end if;

  -- Changing your mind is allowed right up until the last ballot lands, which
  -- is the moment the round resolves below.
  insert into public.game_votes (round_id, voter_id, target_id)
  values (p_round_id, actor, p_target_id)
  on conflict (round_id, voter_id) do update set target_id = excluded.target_id, created_at = now();

  select count(*) into active
    from public.game_round_players seat
    where seat.round_id = p_round_id
      and seat.eliminated_at is null
      and exists (
        select 1 from public.game_room_players member
        where member.room_id = round.room_id and member.user_id = seat.user_id
      );

  select count(*) into cast_votes
    from public.game_votes where round_id = p_round_id;

  if cast_votes >= active then
    perform public.resolve_game_round(p_round_id);
  end if;
end;
$$;

create or replace function public.submit_game_final_guess(p_round_id uuid, p_guess text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  round record;
  answer text;
  cleaned text := btrim(p_guess);
begin
  if actor is null then
    raise exception 'You must be signed in.';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_round_id::text));

  select id, room_id, status, caught_user_id, word_id into round
    from public.game_rounds where id = p_round_id;

  if not found or round.status <> 'GUESSING' then
    raise exception 'This round is not waiting for a guess.';
  end if;

  -- depart_game_room forfeits the guess of a caught imposter who leaves, so
  -- this should be unreachable. It is checked anyway: the guess is the one
  -- write in the game that can flip an outcome by itself.
  if round.caught_user_id is distinct from actor
     or not public.is_game_room_member(round.room_id) then
    raise exception 'Only the caught imposter can guess.';
  end if;

  if char_length(cleaned) < 1 or char_length(cleaned) > 40 then
    raise exception 'Enter the word you think it was.';
  end if;

  select word into answer from public.game_words where id = round.word_id;

  update public.game_rounds
     set status = 'REVEAL',
         final_guess = cleaned,
         outcome = case when lower(cleaned) = lower(answer) then 'IMPOSTER_WIN' else 'CREW_WIN' end,
         ended_at = now()
   where id = p_round_id;
end;
$$;

create or replace function public.game_my_round_secret(p_round_id uuid)
returns table (role text, assigned_word text, hint_text text, roles_hidden boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case
      when round.hide_roles and round.status not in ('REVEAL', 'ENDED') then null
      else secret.role::text
    end,
    secret.assigned_word,
    secret.category_hint_text,
    round.hide_roles
  from public.game_round_secrets secret
  join public.game_rounds round on round.id = secret.round_id
  where secret.round_id = p_round_id
    and secret.user_id = (select auth.uid())
    and public.is_game_room_member(round.room_id);
$$;

comment on function public.game_my_round_secret(uuid) is
  'The caller''s own word, hint and role for a round, while they are still in its room. Role is withheld while the round hides roles and is still in play.';

revoke execute on function public.depart_game_room(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. A disabled account is locked out at the database
-- ---------------------------------------------------------------------------
--
-- Disabling set profiles.disabled_at and banned the Auth user. The ban stops
-- sign-in and token refresh, but an access token already issued stays valid
-- until it expires, and PostgREST checks only its signature. Every policy here
-- authorised on auth.uid() alone, so for up to an hour the browser client could
-- still read and write the account's jobs and shifts, and keep playing. The
-- redirect to /account-disabled only ever guarded the pages.
--
-- Personal data gets a restrictive policy: ANDed with the existing permissive
-- ones, so it narrows access without restating them. The profile row stays
-- readable by its owner -- getSignedInProfile has to read disabled_at to send
-- the user to /account-disabled -- but not writable.
--
-- The game is handled by membership rather than policy, because every game read
-- is already gated on membership and every game write is a security definer
-- function that RLS does not reach. Disabling removes the account from every
-- room it sits in, through the same departure path as a kick, and a disabled
-- account cannot take a seat again.

-- Security definer so a policy on profiles can call it without recursing through
-- profiles' own policies. A user with no profile row yet counts as enabled: that
-- is the first-sign-in path, which creates the row.
create or replace function public.is_account_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and disabled_at is not null
  );
$$;

comment on function public.is_account_enabled() is
  'False when the calling user''s account has been disabled. Used by restrictive policies on personal data.';

revoke execute on function public.is_account_enabled() from public, anon;
grant execute on function public.is_account_enabled() to authenticated;

-- Wrapped in a select so it is evaluated once per statement, not once per row.
create policy "disabled accounts cannot edit their profile" on public.profiles
  as restrictive for update to authenticated
  using ((select public.is_account_enabled()))
  with check ((select public.is_account_enabled()));

create policy "disabled accounts are locked out of jobs" on public.jobs
  as restrictive for all to authenticated
  using ((select public.is_account_enabled()))
  with check ((select public.is_account_enabled()));

create policy "disabled accounts are locked out of shifts" on public.shifts
  as restrictive for all to authenticated
  using ((select public.is_account_enabled()))
  with check ((select public.is_account_enabled()));

create policy "disabled accounts are locked out of job deductions" on public.job_deductions
  as restrictive for all to authenticated
  using ((select public.is_account_enabled()))
  with check ((select public.is_account_enabled()));

create policy "disabled accounts are locked out of the audit log" on public.audit_events
  as restrictive for select to authenticated
  using ((select public.is_account_enabled()));

-- Covers create_game_room and join_game_room both, since each seats the caller
-- with an insert here. Keyed on the seat being taken rather than on auth.uid(),
-- so it holds whoever is doing the inserting.
create or replace function public.refuse_disabled_game_player()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.profiles
    where id = new.user_id
      and disabled_at is not null
  ) then
    raise exception 'This account has been disabled.';
  end if;

  return new;
end;
$$;

create trigger game_room_players_refuse_disabled
before insert on public.game_room_players
for each row execute procedure public.refuse_disabled_game_player();

-- Leaves every live room the way a kick would -- ballots withdrawn, a pending
-- guess forfeited, the host role passed on -- then drops any seats left in
-- ended rooms, whose history is otherwise readable to members. Rooms are taken
-- in id order so two accounts disabled at once lock them in the same order.
-- Re-enabling does not put the account back; it rejoins like anyone else.
create or replace function public.remove_disabled_account_from_games()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  seat record;
begin
  for seat in
    select room_id
      from public.game_room_players
      where user_id = new.id
      order by room_id
  loop
    perform public.depart_game_room(seat.room_id, new.id);
  end loop;

  delete from public.game_room_players where user_id = new.id;

  return null;
end;
$$;

create trigger profiles_disabled_leaves_games
after update of disabled_at on public.profiles
for each row
when (old.disabled_at is null and new.disabled_at is not null)
execute procedure public.remove_disabled_account_from_games();

-- Trigger-only helpers, not public RPCs.
revoke execute on function public.refuse_disabled_game_player() from public, anon, authenticated;
revoke execute on function public.remove_disabled_account_from_games() from public, anon, authenticated;

-- The lobby: create a room, join one by code, change the settings, leave.
--
-- Every mutation here is a security definer function rather than a table grant,
-- and that is the whole design rather than a stylistic preference. Two of these
-- operations cannot be expressed as a policy at all:
--
--   Joining by code has to read a room the caller is not yet a member of. The
--   select policy on game_rooms is membership-based, so a player typing a code
--   cannot see the row they are trying to join -- by construction, since the
--   alternative is a policy that lets anyone read every room in order to find
--   one. A definer function looks the code up with RLS out of the way and
--   inserts the membership row that makes the room visible from then on.
--
--   Capacity and host-only settings are read-modify-write rules. "At most
--   max_players may join" cannot be a check constraint, because the count lives
--   in other rows; as a policy it would race two simultaneous joins past the
--   limit. The advisory lock in join_game_room is what actually enforces it,
--   the same pattern the shift weekly caps use.
--
-- So `authenticated` keeps select and nothing else, and the functions below are
-- the only way the game state changes.

-- The roster carries its own copy of each player's name.
--
-- Reading it off `profiles` instead is the obvious move and is wrong: the RLS
-- policy there is "users read own profile", so one player genuinely cannot see
-- another's name. Widening that policy to cover co-players would expose the
-- whole profile row -- email, role, disabled_at, weekly hour limits -- to
-- anyone who shares a game code with you, to render a name over an avatar.
--
-- Snapshotting also matches what a player expects: the name shown against your
-- clues stays the name you joined under, even if you rename yourself in
-- settings halfway through a game.
alter table public.game_room_players
  add column display_name text not null default 'Player'
  check (char_length(btrim(display_name)) between 1 and 40);

-- The default exists only so the ALTER succeeds against a table that already
-- has rows; phase 1 shipped no way to insert one, but a migration that depends
-- on that being true is a migration that fails on somebody's test data. Dropped
-- immediately, so every real insert has to supply a name.
alter table public.game_room_players alter column display_name drop default;

-- Create a room and seat the host in it.
--
-- Hosting is limited to one live room per person, enforced by ending any the
-- caller already hosts. The alternative -- refusing to create a second -- reads
-- as a bug when the previous room is one you abandoned and cannot easily get
-- back to, and rooms with no route back to them are exactly what accumulates.
--
-- Returns the code rather than the id because the code is what the URL and the
-- invite are built from; the id never has to reach the client.
create or replace function public.create_game_room(
  p_display_name text default null,
  p_decoy_mode boolean default false,
  p_category_hint boolean default false,
  p_imposter_final_guess boolean default true,
  p_imposter_count integer default 1,
  p_clue_passes integer default 1,
  p_max_players integer default 12,
  p_category_filter text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  seat_name text;
  new_room_id uuid;
  new_code text;
  attempts integer := 0;
begin
  if actor is null then
    raise exception 'You must be signed in to host a game.';
  end if;

  select coalesce(
    nullif(btrim(p_display_name), ''),
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

  update public.game_rooms
     set status = 'ENDED', ended_at = now()
   where host_id = actor
     and status <> 'ENDED';

  loop
    new_code := public.generate_game_room_code();

    begin
      insert into public.game_rooms (
        code, host_id, decoy_mode, category_hint, imposter_final_guess,
        imposter_count, clue_passes, max_players, category_filter
      )
      values (
        new_code, actor, p_decoy_mode, p_category_hint, p_imposter_final_guess,
        p_imposter_count, p_clue_passes, p_max_players,
        nullif(btrim(p_category_filter), '')
      )
      returning id into new_room_id;

      exit;
    exception when unique_violation then
      -- generate_game_room_code probes but does not reserve, so two hosts can
      -- still land on the same code between the probe and the insert. The
      -- partial unique index is the real guarantee; this just tries again.
      attempts := attempts + 1;
      if attempts >= 5 then
        raise exception 'Could not allocate a room code. Please try again.';
      end if;
    end;
  end loop;

  insert into public.game_room_players (room_id, user_id, display_name)
  values (new_room_id, actor, seat_name);

  return new_code;
end;
$$;

comment on function public.create_game_room(text, boolean, boolean, boolean, integer, integer, integer, text) is
  'Creates a game room, ends any other room the caller hosts, seats the caller, and returns the invite code.';

-- Join a room by code.
--
-- Only rooms still in the lobby accept players: letting someone in mid-round
-- would mean dealing them into a round whose clues they have not seen, and the
-- round tables have no notion of a late arrival.
--
-- Re-joining is idempotent rather than an error. Closing the tab and coming
-- back is the common case, and it must not read as "you are already in this
-- game" -- the ON CONFLICT refreshes the name and the presence stamp instead.
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
  seat_name text;
  target_room record;
  seated integer;
begin
  if actor is null then
    raise exception 'You must be signed in to join a game.';
  end if;

  select coalesce(
    nullif(btrim(p_display_name), ''),
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

  select id, code, max_players
    into target_room
    from public.game_rooms
    where code = upper(btrim(p_code))
      and status = 'LOBBY';

  if not found then
    raise exception 'That code does not match a game that is waiting for players.';
  end if;

  -- Serialise joins for this room so two players cannot both read a seat count
  -- below the cap and both take the last seat.
  perform pg_advisory_xact_lock(hashtext(target_room.id::text));

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
  do update set display_name = excluded.display_name, last_seen_at = now();

  return target_room.code;
end;
$$;

comment on function public.join_game_room(text, text) is
  'Seats the caller in the lobby matching the code. Idempotent for a player who is already in the room.';

-- Change the room settings.
--
-- Host only, and lobby only. The lobby restriction is the important half: a
-- round snapshots its settings when it is dealt, so a change made mid-round
-- would not alter that round -- the host would see the toggle move and nothing
-- happen, which is worse than being told no.
create or replace function public.update_game_room_settings(
  p_room_id uuid,
  p_decoy_mode boolean,
  p_category_hint boolean,
  p_imposter_final_guess boolean,
  p_imposter_count integer,
  p_clue_passes integer,
  p_max_players integer,
  p_category_filter text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  seated integer;
begin
  if actor is null then
    raise exception 'You must be signed in.';
  end if;

  perform 1
    from public.game_rooms
    where id = p_room_id
      and host_id = actor
      and status = 'LOBBY';

  if not found then
    raise exception 'Only the host can change the settings, and only before a round starts.';
  end if;

  select count(*) into seated
    from public.game_room_players
    where room_id = p_room_id;

  if p_max_players < seated then
    raise exception 'There are already % players in this room.', seated;
  end if;

  update public.game_rooms
     set decoy_mode = p_decoy_mode,
         category_hint = p_category_hint,
         imposter_final_guess = p_imposter_final_guess,
         imposter_count = p_imposter_count,
         clue_passes = p_clue_passes,
         max_players = p_max_players,
         category_filter = nullif(btrim(p_category_filter), '')
   where id = p_room_id;
end;
$$;

comment on function public.update_game_room_settings(uuid, boolean, boolean, boolean, integer, integer, integer, text) is
  'Host-only settings update, refused once a round has been dealt.';

-- Leave a room.
--
-- The host leaving is the case worth handling rather than forbidding: people
-- close tabs. The room passes to whoever joined earliest and survives; it only
-- ends when the last player leaves. Ending the game the moment the host drops
-- would punish everyone else for one person's connection.
create or replace function public.leave_game_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  room_host uuid;
  successor uuid;
begin
  if actor is null then
    raise exception 'You must be signed in.';
  end if;

  -- Taken before the room is read, not after: two players leaving at once must
  -- serialise, and the host check below has to be made against the host as it
  -- is inside the lock. Reading host_id first left a window where a succession
  -- from another transaction landed between the read and the comparison.
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
     and user_id = actor;

  if room_host <> actor then
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

comment on function public.leave_game_room(uuid) is
  'Removes the caller from a room, passing the host role on or ending the room if it is now empty.';

create or replace function public.end_game_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  update public.game_rooms
     set status = 'ENDED', ended_at = now()
   where id = p_room_id
     and host_id = actor
     and status <> 'ENDED';

  if not found then
    raise exception 'Only the host can end this game.';
  end if;
end;
$$;

comment on function public.end_game_room(uuid) is
  'Host-only. Ends the room and releases its code for reuse.';

-- Presence heartbeat, called by the lobby poll.
--
-- Deliberately not an update policy on game_room_players: a player who can
-- update their own roster row can also rewrite their display name to another
-- player's, mid-round, which is a cheap way to muddy a vote. This touches one
-- column and nothing else.
create or replace function public.touch_game_presence(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.game_room_players
     set last_seen_at = now()
   where room_id = p_room_id
     and user_id = (select auth.uid());
end;
$$;

comment on function public.touch_game_presence(uuid) is
  'Refreshes the caller''s presence stamp in a room. Called by the lobby poll.';

-- The category names, for the host's "draw only from" picker.
--
-- A function rather than a constant in the app, because the bank itself is
-- unreadable to `authenticated` -- the client cannot run `select distinct
-- category from game_words`. Hardcoding the list in TypeScript instead would
-- put the categories in two places and let a migration that adds one silently
-- fail to offer it.
--
-- Category names are not secret. The imposter can be shown the category as a
-- deliberate hint setting, so nothing here reveals more than the game already
-- chooses to.
create or replace function public.game_word_categories()
returns table (category text, word_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select game_words.category, count(*) as word_count
  from public.game_words
  group by game_words.category
  order by game_words.category;
$$;

comment on function public.game_word_categories() is
  'Distinct word-bank categories with their sizes, for the host settings picker.';

revoke execute on function public.game_word_categories() from public, anon;
grant execute on function public.game_word_categories() to authenticated;

revoke execute on function public.create_game_room(text, boolean, boolean, boolean, integer, integer, integer, text) from public, anon;
revoke execute on function public.join_game_room(text, text) from public, anon;
revoke execute on function public.update_game_room_settings(uuid, boolean, boolean, boolean, integer, integer, integer, text) from public, anon;
revoke execute on function public.leave_game_room(uuid) from public, anon;
revoke execute on function public.end_game_room(uuid) from public, anon;
revoke execute on function public.touch_game_presence(uuid) from public, anon;

grant execute on function public.create_game_room(text, boolean, boolean, boolean, integer, integer, integer, text) to authenticated;
grant execute on function public.join_game_room(text, text) to authenticated;
grant execute on function public.update_game_room_settings(uuid, boolean, boolean, boolean, integer, integer, integer, text) to authenticated;
grant execute on function public.leave_game_room(uuid) to authenticated;
grant execute on function public.end_game_room(uuid) to authenticated;
grant execute on function public.touch_game_presence(uuid) to authenticated;

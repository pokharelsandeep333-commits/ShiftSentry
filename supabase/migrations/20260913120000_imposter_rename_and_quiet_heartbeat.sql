-- Two changes to the lobby roster, one of them a performance fix.
--
-- 1. Heartbeats stop ringing the room.
--
--    `poll_game_room` writes `last_seen_at` every ten seconds per player, and
--    `game_room_players_broadcast` fired on *every* update to that table -- so
--    each heartbeat rang the Realtime channel, and every client answered with a
--    full server re-render. Six players in an idle lobby produced something like
--    thirty-six renders per ten seconds, which is exactly the load the room
--    fingerprint in 20260907180000 was introduced to avoid. The fingerprint was
--    doing its job for the fallback poll; the socket was undoing it.
--
--    The trigger now fires on insert, delete, and an update *of display_name*
--    only. A column list on `update of` means the trigger runs only when that
--    column is named in the SET clause, so the heartbeat's `set last_seen_at`
--    never reaches it. Presence still moves: the present-count is part of the
--    fingerprint, so the ten-second poll picks up a player going away or coming
--    back, which is as fast as anyone reads a presence dot anyway.
--
-- 2. A player can rename their own seat.
--
--    The create and join forms each carried a name field, which meant typing
--    the same thing in two places -- and a player arriving through an invite
--    link or a QR code never sees either form. One control, on your own row in
--    the lobby, replaces both. The forms now send null and the function's
--    profile-name fallback does the rest.
--
--    Joining a room you are already in used to overwrite your seat name with
--    whatever the fallback produced, which would silently undo a rename the
--    moment you re-opened the invite link. The conflict branch now keeps the
--    existing name unless a name was explicitly passed.

-- ---------------------------------------------------------------------------
-- 1. Quiet heartbeat
-- ---------------------------------------------------------------------------

drop trigger if exists game_room_players_broadcast on public.game_room_players;

create trigger game_room_players_broadcast
after insert or delete or update of display_name on public.game_room_players
for each row execute procedure public.broadcast_game_change();

comment on trigger game_room_players_broadcast on public.game_room_players is
  'Rings the room on join, leave, and rename. Deliberately not on last_seen_at: a heartbeat is not news.';

-- ---------------------------------------------------------------------------
-- 2. Rename
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

  update public.game_room_players seat
     set display_name = seat_name
    from public.game_rooms room
   where seat.room_id = p_room_id
     and seat.user_id = actor
     and room.id = seat.room_id
     and room.status <> 'ENDED';

  if not found then
    raise exception 'You are not in that game.';
  end if;
end;
$$;

comment on function public.rename_game_player(uuid, text) is
  'Changes the caller''s own seat name in a live room. Nobody can rename anyone else.';

revoke execute on function public.rename_game_player(uuid, text) from public, anon;
grant execute on function public.rename_game_player(uuid, text) to authenticated;

-- The fingerprint has to notice a rename, or a player on the fallback poll
-- keeps drawing the old name until something else happens to change.
create or replace function public.game_room_version(p_room_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select concat_ws('|',
    room.status::text,
    room.imposter_hint,
    room.hide_roles::text,
    room.imposter_final_guess::text,
    room.imposter_count::text,
    room.clue_passes::text,
    room.max_players::text,
    room.ban_repeat_clues::text,
    room.discussion_phase::text,
    room.word_difficulty,
    coalesce(room.category_filter, ''),
    room.host_id::text,
    (select count(*) from public.game_room_players seat where seat.room_id = room.id)::text,
    (
      select count(*) from public.game_room_players seat
      where seat.room_id = room.id
        and seat.last_seen_at > now() - interval '20 seconds'
    )::text,
    -- Names, hashed rather than concatenated so the fingerprint stays short and
    -- carries nothing readable. Ordered by user_id so the same roster always
    -- hashes the same way.
    coalesce((
      select md5(string_agg(seat.display_name, chr(31) order by seat.user_id))
      from public.game_room_players seat
      where seat.room_id = room.id
    ), ''),
    coalesce(latest.id::text, ''),
    coalesce(latest.status::text, ''),
    coalesce(latest.current_pass::text, ''),
    coalesce(latest.caught_user_id::text, ''),
    coalesce(latest.outcome, ''),
    (select count(*) from public.game_clues clue where clue.round_id = latest.id)::text,
    (select count(*) from public.game_votes vote where vote.round_id = latest.id)::text,
    (select count(*) from public.game_round_players seat where seat.round_id = latest.id and seat.eliminated_at is not null)::text
  )
  from public.game_rooms room
  left join lateral (
    select round.id, round.status, round.current_pass, round.caught_user_id, round.outcome
    from public.game_rounds round
    where round.room_id = room.id
    order by round.round_no desc
    limit 1
  ) latest on true
  where room.id = p_room_id
    and public.is_game_room_member(p_room_id);
$$;

-- ---------------------------------------------------------------------------
-- 3. Rejoining keeps your name
-- ---------------------------------------------------------------------------

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
  do update set
    -- A name you chose in the lobby survives re-opening the invite link. Only
    -- an explicit name overrides it.
    display_name = coalesce(explicit_name, public.game_room_players.display_name),
    last_seen_at = now();

  return target_room.code;
end;
$$;

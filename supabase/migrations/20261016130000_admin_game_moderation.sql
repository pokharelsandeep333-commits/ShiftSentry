-- Imposter moderation for admins: end a room, remove a player, reset a name.
--
-- The Terms already forbid harassment and private information in game names
-- and let us restrict accounts that break them; these are the tools. Each is
-- server only (no API role can execute it) and is audited by the action that
-- calls it. They follow the rules every game write keeps:
--   * departure goes through depart_game_room and only through it, so a
--     removed player's turn, ballots and pending guess are settled;
--   * room before round, by the same advisory lock the host's kick takes;
--   * an ended room stays ended.

-- ---------------------------------------------------------------------------
-- End a room. The same update end_game_room makes, without the host check, so
-- the game_rooms_ended_close_rounds trigger closes any live round exactly as
-- it does when a host ends the game. Returns false if it had already ended.
-- ---------------------------------------------------------------------------
create function public.admin_end_game_room(p_room_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_room_id::text));
  update public.game_rooms
     set status = 'ENDED', ended_at = now()
   where id = p_room_id
     and status <> 'ENDED';
  return found;
end;
$$;
revoke execute on function public.admin_end_game_room(uuid) from public, anon, authenticated;
grant execute on function public.admin_end_game_room(uuid) to service_role;
comment on function public.admin_end_game_room(uuid) is
  'Server only. Ends a room as its host would; the ENDED trigger closes any live round. Audited by the calling action.';

-- ---------------------------------------------------------------------------
-- Remove a player. The host's kick_game_player without the host check: the
-- room lock first, the seat checked inside it, then depart_game_room (which
-- re-takes the same lock; advisory locks are re-entrant within a transaction)
-- to settle the turn, ballots, pending guess and host role. Raises when the
-- room has ended or the player is not seated, so the admin is told rather
-- than shown a success that did nothing.
-- ---------------------------------------------------------------------------
create function public.admin_remove_game_player(p_room_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_room_id::text));
  if not exists (select 1 from public.game_rooms where id = p_room_id and status <> 'ENDED') then
    raise exception 'That room has ended.';
  end if;
  if not exists (select 1 from public.game_room_players where room_id = p_room_id and user_id = p_user_id) then
    raise exception 'That player is no longer in the room.';
  end if;
  perform public.depart_game_room(p_room_id, p_user_id);
end;
$$;
revoke execute on function public.admin_remove_game_player(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_remove_game_player(uuid, uuid) to service_role;
comment on function public.admin_remove_game_player(uuid, uuid) is
  'Server only. Removes a player through depart_game_room, as a host kick does. Audited by the calling action.';

-- ---------------------------------------------------------------------------
-- Reset a seat's name to "Player N", N being the seat's place in join order.
-- An update of display_name, so game_room_players_broadcast tells the room
-- and game_room_version's name hash changes, as for a rename. The player can
-- rename again; repeated abuse is what disabling the account is for.
-- ---------------------------------------------------------------------------
create function public.admin_reset_game_name(p_room_id uuid, p_user_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare seat_number integer; new_name text;
begin
  perform pg_advisory_xact_lock(hashtext(p_room_id::text));
  if not exists (select 1 from public.game_rooms where id = p_room_id and status <> 'ENDED') then
    raise exception 'That room has ended.';
  end if;
  select ordinal into seat_number from (
    select user_id, row_number() over (order by joined_at, user_id) as ordinal
      from public.game_room_players where room_id = p_room_id
  ) seats where seats.user_id = p_user_id;
  if seat_number is null then
    raise exception 'That player is no longer in the room.';
  end if;
  new_name := 'Player ' || seat_number;
  update public.game_room_players set display_name = new_name where room_id = p_room_id and user_id = p_user_id;
  return new_name;
end;
$$;
revoke execute on function public.admin_reset_game_name(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_reset_game_name(uuid, uuid) to service_role;
comment on function public.admin_reset_game_name(uuid, uuid) is
  'Server only. Replaces a seat name with "Player N" (join order). Audited by the calling action.';

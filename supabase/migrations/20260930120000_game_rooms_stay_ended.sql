-- An ended room stays ended, and the host role ends with the seat.
--
-- Ending a room only ever set game_rooms.status. A round still being played
-- stayed live under it, and `abandon_game_round` / `finish_game_round` checked
-- nothing but `host_id = actor` before moving the room to LOBBY. Together that
-- let a host reopen a room after ending it, and -- the part that mattered -- let
-- a *disabled* host do so: disabling removes every seat, but
-- `depart_game_room` returns early for an ended room, so `host_id` still named
-- them, and an access token already issued is accepted until it expires.
-- Reopened, the room was a live lobby under a host with no seat, and every
-- host-only function (start, settings, kick) checks only `host_id`.
--
-- Three changes close it:
--
--   1. A room that becomes ENDED closes its live round in the same statement,
--      by trigger, so every path that ends a room -- end_game_room,
--      create_game_room ending the host's previous room, the last player
--      departing, the idle cleanup -- is covered without restating each one.
--      Existing rooms in that state are closed below.
--
--   2. Closing or abandoning a round requires a PLAYING room, a host who is
--      still seated, and an enabled account. Room, then round, then the room
--      row, the lock order every game function uses.
--
--   3. The room-read exception for the host no longer covers a disabled one.
--
-- With ended rooms unable to reopen, and a disabled account removed from every
-- live room (host passed on) and refused a new seat, no room a disabled account
-- could still be host of is one a host-only function will act on.

-- 1. Close the rounds of rooms that end. -------------------------------------

-- Same marking as abandon_game_round: a round with no result is an abandoned
-- one; a round already decided keeps its outcome and still scores.
create or replace function public.close_rounds_of_ended_room()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.game_rounds
     set status = 'ENDED',
         ended_at = coalesce(ended_at, now()),
         abandoned_at = case when outcome is null then now() else abandoned_at end
   where room_id = new.id
     and status <> 'ENDED';

  return null;
end;
$$;

comment on function public.close_rounds_of_ended_room() is
  'AFTER trigger. When a room ends, its round in progress ends with it, so nothing is left to reopen the room from.';

revoke execute on function public.close_rounds_of_ended_room() from public, anon, authenticated;

create trigger game_rooms_ended_close_rounds
after update of status on public.game_rooms
for each row
when (old.status <> 'ENDED' and new.status = 'ENDED')
execute procedure public.close_rounds_of_ended_room();

update public.game_rounds
   set status = 'ENDED',
       ended_at = coalesce(game_rounds.ended_at, now()),
       abandoned_at = case when game_rounds.outcome is null then now() else game_rounds.abandoned_at end
  from public.game_rooms
 where game_rooms.id = game_rounds.room_id
   and game_rooms.status = 'ENDED'
   and game_rounds.status <> 'ENDED';

-- 2. Only a seated, enabled host of a live room closes its round. ------------

create or replace function public.abandon_game_round(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  round_room uuid;
  room_status public.game_room_status;
  round record;
begin
  -- A round never changes room, so this can be read before either lock is held.
  select room_id into round_room from public.game_rounds where id = p_round_id;

  if not found then
    raise exception 'Only the host can end this round.';
  end if;

  perform pg_advisory_xact_lock(hashtext(round_room::text));
  perform pg_advisory_xact_lock(hashtext(p_round_id::text));

  -- `for update` so a room ended concurrently by a path that holds no advisory
  -- lock (create_game_room, the idle cleanup) is seen as ended here.
  select status into room_status
    from public.game_rooms
    where id = round_room
      and host_id = actor
    for update;

  if not found or not public.is_game_room_member(round_room) or not public.is_account_enabled() then
    raise exception 'Only the host can end this round.';
  end if;

  select id, status into round from public.game_rounds where id = p_round_id;

  -- A room that is not PLAYING has no round to close: either this one was
  -- already closed (a double tap) or the room ended, which closed it.
  if room_status <> 'PLAYING' or round.status = 'ENDED' then
    raise exception 'That round is already over.';
  end if;

  update public.game_rounds
     set status = 'ENDED',
         ended_at = coalesce(ended_at, now()),
         -- Only an undecided round is an abandoned one. See 20260907200000.
         abandoned_at = case when outcome is null then now() else abandoned_at end
   where id = p_round_id;

  update public.game_rooms set status = 'LOBBY' where id = round_room;
end;
$$;

comment on function public.abandon_game_round(uuid) is
  'Host-only. Ends a round in progress with no result and returns a live room to the lobby.';

create or replace function public.finish_game_round(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  round_room uuid;
  room_status public.game_room_status;
  round record;
begin
  select room_id into round_room from public.game_rounds where id = p_round_id;

  if not found then
    raise exception 'Only the host can close this round.';
  end if;

  perform pg_advisory_xact_lock(hashtext(round_room::text));
  perform pg_advisory_xact_lock(hashtext(p_round_id::text));

  select status into room_status
    from public.game_rooms
    where id = round_room
      and host_id = actor
    for update;

  if not found or not public.is_game_room_member(round_room) or not public.is_account_enabled() then
    raise exception 'Only the host can close this round.';
  end if;

  select id, status into round from public.game_rounds where id = p_round_id;

  -- A room that is not PLAYING has no round to close: either this one was
  -- already closed (a double tap) or the room ended, which closed it.
  if room_status <> 'PLAYING' or round.status = 'ENDED' then
    raise exception 'That round is already over.';
  end if;

  if round.status <> 'REVEAL' then
    raise exception 'This round is still being played.';
  end if;

  update public.game_rounds
     set status = 'ENDED', ended_at = coalesce(ended_at, now())
   where id = p_round_id;

  update public.game_rooms set status = 'LOBBY' where id = round_room;
end;
$$;

comment on function public.finish_game_round(uuid) is
  'Host-only. Closes a revealed round and returns a live room to the lobby.';

-- `create or replace` keeps the existing grants; restated so this file says
-- who may call what without reading back through the history.
revoke execute on function public.abandon_game_round(uuid) from public, anon;
revoke execute on function public.finish_game_round(uuid) from public, anon;
grant execute on function public.abandon_game_round(uuid) to authenticated;
grant execute on function public.finish_game_round(uuid) to authenticated;

-- 3. A disabled former host no longer reads the room. ------------------------

drop policy "members read their rooms" on public.game_rooms;

create policy "members read their rooms" on public.game_rooms
  for select using (
    public.is_game_room_member(id)
    or (host_id = (select auth.uid()) and (select public.is_account_enabled()))
  );

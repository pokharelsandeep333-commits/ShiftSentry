-- Close rooms nobody came back to.
--
-- Every abandoned game holds its invite code out of circulation, because the
-- unique index that keeps codes short only frees a code when its room ends. A
-- host who closes the tab mid-lobby leaves one behind, and nothing in the app
-- ever ends it: `leave_game_room` only fires when somebody actively leaves.
--
-- Idleness is measured from the newest presence heartbeat in the room rather
-- than from when it was created, so a game that has run for six hours is left
-- alone while one nobody has touched for two is not. A room with no players at
-- all falls back to its creation time, which covers the case where everyone left
-- and the last leaver was the host handing off to nobody.
--
-- Scheduling lives in the next migration so this function can ship on its own.
create or replace function public.cleanup_stale_game_rooms(p_idle_minutes integer default 120)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed integer;
begin
  if p_idle_minutes < 5 then
    raise exception 'Refusing to close rooms idle for less than five minutes.';
  end if;

  update public.game_rooms
     set status = 'ENDED', ended_at = now()
   where status <> 'ENDED'
     and coalesce(
       (
         select max(player.last_seen_at)
         from public.game_room_players player
         where player.room_id = game_rooms.id
       ),
       game_rooms.created_at
     ) < now() - make_interval(mins => p_idle_minutes);

  get diagnostics closed = row_count;
  return closed;
end;
$$;

comment on function public.cleanup_stale_game_rooms(integer) is
  'Ends rooms with no presence for the given number of minutes, releasing their invite codes. Maintenance only.';

-- Maintenance, not an API. Nothing a signed-in player does should be able to end
-- other people's games, and the scheduled job runs as the job owner.
revoke execute on function public.cleanup_stale_game_rooms(integer) from public, anon, authenticated;

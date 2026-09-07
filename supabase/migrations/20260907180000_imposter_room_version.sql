-- One cheap call that answers "has anything changed?", so the fallback poll
-- stops re-rendering the page every couple of seconds for nothing.
--
-- The lobby was doing two things on every tick: a presence heartbeat, and an
-- unconditional `router.refresh()`. That refresh re-runs the whole server render
-- -- the lobby query, the scoreboard, and the category list for a host -- so a
-- quiet room with nobody doing anything was still paying four round trips every
-- 2.5 seconds, per player.
--
-- It was also making the game feel broken. Next.js serialises Server Actions, so
-- a tap on "End game" queues behind whatever the poll already has in flight. On
-- a phone, that is most of the time, and the button appears to do nothing for a
-- second or two before suddenly working.
--
-- This returns a fingerprint of everything the screen actually draws. The client
-- compares it to the last one and only refreshes when it differs, which in a
-- room where nobody is doing anything is never.
--
-- Presence is folded in as a *count of who is currently present*, not as the
-- timestamps themselves. Including last_seen_at would change the fingerprint on
-- every heartbeat and defeat the whole exercise; the count changes only when
-- somebody actually goes away or comes back, which is exactly when a dot needs
-- to move.
create or replace function public.game_room_version(p_room_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select concat_ws('|',
    room.status::text,
    -- The settings themselves, not `updated_at` as a proxy for them. A timestamp
    -- is the wrong tool twice over: truncated to seconds it misses two saves in
    -- the same second, and at full precision it still cannot move within a
    -- single transaction, because now() is fixed for its duration. Listing what
    -- the screen actually draws cannot be wrong about whether the screen changed.
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

comment on function public.game_room_version(uuid) is
  'Fingerprint of everything a game screen draws. Changes only when the screen should.';

-- Heartbeat and fingerprint in one call, so the poll is a single round trip
-- rather than two -- which halves the window in which a player''s tap can end up
-- queued behind it.
create or replace function public.poll_game_room(p_room_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.game_room_players
     set last_seen_at = now()
   where room_id = p_room_id
     and user_id = (select auth.uid());

  return public.game_room_version(p_room_id);
end;
$$;

comment on function public.poll_game_room(uuid) is
  'Refreshes the caller''s presence and returns the room fingerprint. The lobby poll''s only call.';

revoke execute on function public.game_room_version(uuid) from public, anon;
revoke execute on function public.poll_game_room(uuid) from public, anon;
grant execute on function public.game_room_version(uuid) to authenticated;
grant execute on function public.poll_game_room(uuid) to authenticated;

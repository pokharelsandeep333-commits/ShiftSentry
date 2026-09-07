-- Fixtures the round suites share. Test-only: they live in a throwaway
-- database that is created and destroyed by scripts/run-sql-tests.sh, and are
-- never part of a migration.

-- Test-only helper: seats `p_seats` players, applies the settings, and deals.
-- Not SECURITY DEFINER -- it switches role itself so the game functions see the
-- right auth.uid() at each step.
create or replace function test_deal(
  p_hint text, p_hide_roles boolean, p_guess boolean,
  p_imposters integer, p_passes integer, p_seats integer,
  p_ban_repeats boolean default true, p_discussion boolean default false,
  p_difficulty text default 'HARD'
)
returns table (room_id uuid, round_id uuid, imposter_ids uuid[])
language plpgsql
as $$
declare
  everyone constant uuid[] := array[
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333',
    '44444444-4444-4444-4444-444444444444',
    '55555555-5555-5555-5555-555555555555'
  ];
  host constant uuid := everyone[1];
  who uuid;
  new_code text;
  rm uuid;
  rd uuid;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', host::text, true);
  new_code := public.create_game_room('Host');

  execute 'set local role postgres';
  select id into rm from public.game_rooms where game_rooms.code = new_code;
  execute 'set local role authenticated';

  foreach who in array everyone[2:p_seats] loop
    perform set_config('request.jwt.claim.sub', who::text, true);
    perform public.join_game_room(new_code, null);
  end loop;

  perform set_config('request.jwt.claim.sub', host::text, true);
  -- 'HARD' by default so the round suites draw from the whole bank; the
  -- difficulty filter has its own coverage in 06.
  perform public.update_game_room_settings(
    rm, p_hint, p_hide_roles, p_guess, p_imposters, p_passes, 20,
    p_ban_repeats, p_discussion, p_difficulty, null);
  rd := public.start_game_round(rm);

  execute 'set local role postgres';
  return query
    select rm, rd, array(
      select s.user_id from public.game_round_secrets s where s.round_id = rd and s.role = 'IMPOSTER'
    );
end;
$$;

-- Test-only helper: play out every clue in every pass.
--
-- Reads whose turn it is as whichever player is still in the room, rather than
-- as a fixed identity. `game_round_turn` refuses callers who are not members, so
-- an observer who happens to be the player that just walked out returns null and
-- the loop exits after one clue -- which looked exactly like the round stalling.
-- Scenario E in 03_branches removes a randomly chosen player, so that was a one
-- in five failure rather than a reliable one.
create or replace function test_all_clues(p_round uuid)
returns integer
language plpgsql
as $$
declare
  observer uuid;
  turn uuid;
  already integer;
  given integer;
begin
  execute 'set local role postgres';
  select member.user_id into observer
    from public.game_room_players member
    join public.game_rounds round on round.room_id = member.room_id
    where round.id = p_round
    limit 1;

  -- Numbering continues from whatever has already been said. A tiebreak calls
  -- this a second time on the same round, and `ban_repeat_clues` refuses a clue
  -- anyone has given before -- so restarting at 1 fails, correctly.
  select count(*) into already from public.game_clues where round_id = p_round;
  given := already;

  execute 'set local role authenticated';
  loop
    perform set_config('request.jwt.claim.sub', observer::text, true);
    turn := public.game_round_turn(p_round);
    exit when turn is null;
    perform set_config('request.jwt.claim.sub', turn::text, true);
    given := given + 1;
    perform public.submit_game_clue(p_round, 'clue ' || given);
  end loop;

  execute 'set local role postgres';
  -- How many *this* call took, not the running total.
  return given - already;
end;
$$;

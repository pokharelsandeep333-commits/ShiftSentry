\set ON_ERROR_STOP on

-- A full round, played end to end by four seated players.
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  carol constant uuid := '33333333-3333-3333-3333-333333333333';
  dave  constant uuid := '44444444-4444-4444-4444-444444444444';
  players constant uuid[] := array[alice, bob, carol, dave];
  who uuid;
  room_code text;
  room uuid;
  round uuid;
  turn uuid;
  imposter uuid;
  crew_word text;
  imposter_word text;
  hint text;
  clue_count integer;
  phase text;
  result text;
  reveal record;
  seen integer;
  others uuid[];
  first_voter uuid;
  second_voter uuid;
begin
  execute 'set local role authenticated';

  -- ---- lobby ----------------------------------------------------------
  perform set_config('request.jwt.claim.sub', alice::text, true);
  room_code := public.create_game_room('Alice');
  execute 'set local role postgres';
  select id into room from public.game_rooms where game_rooms.code = room_code;
  execute 'set local role authenticated';

  foreach who in array players[2:4] loop
    perform set_config('request.jwt.claim.sub', who::text, true);
    perform public.join_game_room(room_code, null);
  end loop;

  -- decoy off, hint on, final guess on, 1 imposter, 1 pass
  perform set_config('request.jwt.claim.sub', alice::text, true);
  perform public.update_game_room_settings(room, false, true, true, 1, 1, 8, null);

  -- ---- deal -----------------------------------------------------------
  round := public.start_game_round(room);
  raise notice 'round dealt';

  execute 'set local role postgres';
  select status::text into phase from public.game_rooms where id = room;
  if phase <> 'PLAYING' then raise exception 'room did not enter play (%)', phase; end if;

  select user_id into imposter from public.game_round_secrets
   where round_id = round and role = 'IMPOSTER';
  select count(*) into seen from public.game_round_secrets where round_id = round;
  if seen <> 4 then raise exception 'expected 4 secrets, got %', seen; end if;

  select assigned_word into imposter_word from public.game_round_secrets
   where round_id = round and user_id = imposter;
  select category_hint_text into hint from public.game_round_secrets
   where round_id = round and user_id = imposter;
  select assigned_word into crew_word from public.game_round_secrets
   where round_id = round and role = 'CREW' limit 1;

  if imposter_word is not null then raise exception 'no-decoy imposter got a word: %', imposter_word; end if;
  if hint is null then raise exception 'category hint was on but not stored'; end if;
  if crew_word is null then raise exception 'crew got no word'; end if;
  raise notice 'crew hold "%", imposter holds nothing, hint "%"', crew_word, hint;

  select count(*) into seen from public.game_round_secrets
   where round_id = round and role = 'CREW' and assigned_word is distinct from crew_word;
  if seen <> 0 then raise exception 'crew do not share one word'; end if;

  -- ---- out-of-turn clue is refused ------------------------------------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', alice::text, true);
  turn := public.game_round_turn(round);

  select user_id into who from public.game_round_players
   where round_id = round and user_id <> turn limit 1;
  perform set_config('request.jwt.claim.sub', who::text, true);
  begin
    perform public.submit_game_clue(round, 'jumping the queue');
    raise exception 'turn order was not enforced';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'It is not your turn yet.' then raise; end if;
    raise notice 'out-of-turn clue refused';
  end;

  -- ---- clues in order --------------------------------------------------
  loop
    perform set_config('request.jwt.claim.sub', alice::text, true);
    turn := public.game_round_turn(round);
    exit when turn is null;
    perform set_config('request.jwt.claim.sub', turn::text, true);
    perform public.submit_game_clue(round, 'hot');
  end loop;

  execute 'set local role postgres';
  select count(*) into clue_count from public.game_clues where round_id = round;
  select status::text into phase from public.game_rounds where id = round;
  if clue_count <> 4 then raise exception 'expected 4 clues, got %', clue_count; end if;
  if phase <> 'VOTING' then raise exception 'did not advance to voting (%)', phase; end if;
  raise notice '4 clues taken in turn, phase is now VOTING';

  -- ---- the reveal is not available yet ---------------------------------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', imposter::text, true);
  select count(*) into seen from public.game_round_reveal(round);
  if seen <> 0 then raise exception 'LEAK: reveal available during voting'; end if;
  raise notice 'reveal returns nothing before the round ends';

  -- ---- votes are secret while voting -----------------------------------
  -- Roles are dealt at random, so the voters are chosen by role rather than by
  -- name: whoever drew the imposter must not be asked to vote for themselves.
  execute 'set local role postgres';
  select array_agg(user_id) into others
    from public.game_round_players where round_id = round and user_id <> imposter;
  execute 'set local role authenticated';

  first_voter := others[1];
  second_voter := others[2];

  perform set_config('request.jwt.claim.sub', first_voter::text, true);
  perform public.submit_game_vote(round, imposter);

  perform set_config('request.jwt.claim.sub', second_voter::text, true);
  select count(*) into seen from public.game_votes where round_id = round;
  if seen <> 0 then raise exception 'LEAK: another player sees % ballots mid-vote', seen; end if;
  raise notice 'ballots hidden from other players during the vote';

  select count(*) into seen from public.game_round_voters(round);
  if seen <> 1 then raise exception 'voter progress should show 1, showed %', seen; end if;
  raise notice 'voter progress visible without the targets';

  -- ---- the rest of the crew convict the imposter -----------------------
  foreach who in array others loop
    if who <> first_voter then
      perform set_config('request.jwt.claim.sub', who::text, true);
      perform public.submit_game_vote(round, imposter);
    end if;
  end loop;

  -- imposter votes last, which is the ballot that resolves the round
  perform set_config('request.jwt.claim.sub', imposter::text, true);
  perform public.submit_game_vote(round, first_voter);

  execute 'set local role postgres';
  select status::text, caught_user_id into phase, who from public.game_rounds where id = round;
  if phase <> 'GUESSING' then raise exception 'caught imposter should be guessing, phase is %', phase; end if;
  if who <> imposter then raise exception 'wrong player caught'; end if;
  raise notice 'imposter caught, round moved to GUESSING';

  -- ---- a wrong guess loses ---------------------------------------------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', imposter::text, true);
  perform public.submit_game_final_guess(round, 'definitely not the word');

  execute 'set local role postgres';
  select status::text, outcome into phase, result from public.game_rounds where id = round;
  if phase <> 'REVEAL' or result <> 'CREW_WIN' then
    raise exception 'wrong guess should give the crew the round (% / %)', phase, result;
  end if;
  raise notice 'wrong final guess -> CREW_WIN';

  -- ---- reveal now works, and votes become public -----------------------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', bob::text, true);
  select * into reveal from public.game_round_reveal(round);
  if reveal.word <> crew_word then raise exception 'reveal word % <> %', reveal.word, crew_word; end if;
  if not (imposter = any(reveal.imposter_ids)) then raise exception 'reveal did not name the imposter'; end if;

  select count(*) into seen from public.game_votes where round_id = round;
  if seen <> 4 then raise exception 'votes should be public after the reveal, saw %', seen; end if;
  raise notice 'reveal shows "%" and names the imposter; all 4 ballots now public', reveal.word;

  -- ---- host closes the round -------------------------------------------
  perform set_config('request.jwt.claim.sub', bob::text, true);
  begin
    perform public.finish_game_round(round);
    raise exception 'a non-host closed the round';
  exception when sqlstate 'P0001' then
    raise notice 'round close refused for non-host';
  end;

  perform set_config('request.jwt.claim.sub', alice::text, true);
  perform public.finish_game_round(round);

  execute 'set local role postgres';
  select status::text into phase from public.game_rooms where id = room;
  if phase <> 'LOBBY' then raise exception 'room did not return to the lobby (%)', phase; end if;
  raise notice 'round closed, room back in the lobby';

  raise notice 'FULL ROUND PASSED';
end;
$$;

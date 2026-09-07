\set ON_ERROR_STOP on

-- A: decoy mode, and a correct final guess steals the round -------------
do $$
declare
  deal record; imposter uuid; word text; held text; phase text; result text;
begin
  select * into deal from test_deal(true, false, true, 1, 1, 4);
  imposter := deal.imposter_ids[1];

  select assigned_word into held from public.game_round_secrets
   where round_id = deal.round_id and user_id = imposter;
  select w.word, w.decoy_word into word, phase
    from public.game_rounds r join public.game_words w on w.id = r.word_id
   where r.id = deal.round_id;

  if held is null then raise exception 'decoy mode gave the imposter nothing'; end if;
  if held <> phase then raise exception 'imposter holds % not the decoy %', held, phase; end if;
  if held = word then raise exception 'imposter was handed the real word'; end if;
  raise notice 'A: decoy mode -- crew "%", imposter "%"', word, held;

  perform test_all_clues(deal.round_id);

  execute 'set local role authenticated';
  declare others uuid[]; who uuid;
  begin
    execute 'set local role postgres';
    select array_agg(user_id) into others from public.game_round_players
     where round_id = deal.round_id and user_id <> imposter;
    execute 'set local role authenticated';
    foreach who in array others loop
      perform set_config('request.jwt.claim.sub', who::text, true);
      perform public.submit_game_vote(deal.round_id, imposter);
    end loop;
    perform set_config('request.jwt.claim.sub', imposter::text, true);
    perform public.submit_game_vote(deal.round_id, others[1]);
    perform public.submit_game_final_guess(deal.round_id, upper(word));
  end;

  execute 'set local role postgres';
  select status::text, outcome into phase, result from public.game_rounds where id = deal.round_id;
  if phase <> 'REVEAL' or result <> 'IMPOSTER_WIN' then
    raise exception 'A: correct guess should win it (% / %)', phase, result;
  end if;
  raise notice 'A: correct final guess (case-insensitive) -> IMPOSTER_WIN';
end;
$$;

-- B: the crew convict an innocent -----------------------------------------
do $$
declare
  deal record; imposter uuid; victim uuid; who uuid; others uuid[]; phase text; result text;
begin
  select * into deal from test_deal(false, false, true, 1, 1, 4);
  imposter := deal.imposter_ids[1];
  perform test_all_clues(deal.round_id);

  select array_agg(user_id) into others from public.game_round_players
   where round_id = deal.round_id and user_id <> imposter;
  victim := others[1];

  execute 'set local role authenticated';
  foreach who in array others loop
    if who <> victim then
      perform set_config('request.jwt.claim.sub', who::text, true);
      perform public.submit_game_vote(deal.round_id, victim);
    end if;
  end loop;
  perform set_config('request.jwt.claim.sub', imposter::text, true);
  perform public.submit_game_vote(deal.round_id, victim);
  perform set_config('request.jwt.claim.sub', victim::text, true);
  perform public.submit_game_vote(deal.round_id, others[2]);

  execute 'set local role postgres';
  select status::text, outcome into phase, result from public.game_rounds where id = deal.round_id;
  if phase <> 'REVEAL' or result <> 'IMPOSTER_WIN' then
    raise exception 'B: convicting the crew should lose it (% / %)', phase, result;
  end if;
  raise notice 'B: innocent convicted -> IMPOSTER_WIN, no guess phase';
end;
$$;

-- C: a clear majority eliminates exactly one player -----------------------
--
-- Asserts the mechanics of a decisive vote rather than the outcome: whether the
-- round lands on CREW_WIN, GUESSING or IMPOSTER_WIN depends on whether seat 3
-- happened to draw the imposter, which is random. What must hold every time is
-- that 3-1 removes one player, that it is the one who was voted for, and that
-- the round leaves the voting phase.
do $$
declare
  deal record; seats uuid[]; phase text; eliminated integer; who uuid;
begin
  select * into deal from test_deal(false, false, true, 1, 1, 4);
  perform test_all_clues(deal.round_id);

  select array_agg(user_id order by turn_order) into seats
    from public.game_round_players where round_id = deal.round_id;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', seats[1]::text, true);
  perform public.submit_game_vote(deal.round_id, seats[3]);
  perform set_config('request.jwt.claim.sub', seats[2]::text, true);
  perform public.submit_game_vote(deal.round_id, seats[3]);
  perform set_config('request.jwt.claim.sub', seats[3]::text, true);
  perform public.submit_game_vote(deal.round_id, seats[4]);
  perform set_config('request.jwt.claim.sub', seats[4]::text, true);
  perform public.submit_game_vote(deal.round_id, seats[3]);

  execute 'set local role postgres';
  select status::text, caught_user_id into phase, who
    from public.game_rounds where id = deal.round_id;
  select count(*) into eliminated from public.game_round_players
   where round_id = deal.round_id and eliminated_at is not null;

  if phase = 'VOTING' then raise exception 'C: a completed vote did not resolve'; end if;
  if eliminated <> 1 then raise exception 'C: 3-1 eliminated % players', eliminated; end if;
  if who is distinct from seats[3] then raise exception 'C: the wrong player was eliminated'; end if;
  raise notice 'C: 3-1 majority removed exactly the player voted for';
end;
$$;

-- C2: a genuine 2-2 tie ---------------------------------------------------
do $$
declare
  deal record; seats uuid[]; phase text; result text; caught uuid; eliminated integer;
begin
  select * into deal from test_deal(false, false, true, 1, 1, 4);
  perform test_all_clues(deal.round_id);

  select array_agg(user_id order by turn_order) into seats
    from public.game_round_players where round_id = deal.round_id;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', seats[1]::text, true);
  perform public.submit_game_vote(deal.round_id, seats[3]);
  perform set_config('request.jwt.claim.sub', seats[2]::text, true);
  perform public.submit_game_vote(deal.round_id, seats[3]);
  perform set_config('request.jwt.claim.sub', seats[3]::text, true);
  perform public.submit_game_vote(deal.round_id, seats[1]);
  perform set_config('request.jwt.claim.sub', seats[4]::text, true);
  perform public.submit_game_vote(deal.round_id, seats[1]);

  execute 'set local role postgres';
  select status::text, outcome, caught_user_id into phase, result, caught
    from public.game_rounds where id = deal.round_id;
  select count(*) into eliminated from public.game_round_players
   where round_id = deal.round_id and eliminated_at is not null;

  if phase <> 'REVEAL' or result <> 'IMPOSTER_WIN' then
    raise exception 'C2: a tie should go to the imposters (% / %)', phase, result;
  end if;
  if caught is not null then raise exception 'C2: a tie caught somebody'; end if;
  if eliminated <> 0 then raise exception 'C2: a tie eliminated % players', eliminated; end if;
  raise notice 'C2: 2-2 tie -> nobody out, IMPOSTER_WIN';
end;
$$;

-- D: two clue passes ------------------------------------------------------
do $$
declare
  deal record; given integer; phase text;
begin
  select * into deal from test_deal(false, false, true, 1, 2, 4);
  given := test_all_clues(deal.round_id);
  select status::text into phase from public.game_rounds where id = deal.round_id;
  if given <> 8 then raise exception 'D: expected 8 clues over 2 passes, got %', given; end if;
  if phase <> 'VOTING' then raise exception 'D: phase is % after both passes', phase; end if;
  raise notice 'D: 2 passes x 4 players = 8 clues, then VOTING';
end;
$$;

-- E: someone closes their tab mid-round -----------------------------------
do $$
declare
  deal record; leaver uuid; turn uuid; given integer; phase text;
begin
  select * into deal from test_deal(false, false, true, 1, 1, 5);

  -- whoever is due to speak second walks out before saying anything
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  turn := public.game_round_turn(deal.round_id);
  perform set_config('request.jwt.claim.sub', turn::text, true);
  perform public.submit_game_clue(deal.round_id, 'first');

  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  leaver := public.game_round_turn(deal.round_id);

  perform set_config('request.jwt.claim.sub', leaver::text, true);
  perform public.leave_game_room(deal.room_id);

  given := test_all_clues(deal.round_id) + 1;
  select status::text into phase from public.game_rounds where id = deal.round_id;

  if phase <> 'VOTING' then raise exception 'E: a departed player stalled the round at %', phase; end if;
  if given <> 4 then raise exception 'E: expected 4 clues from the 4 who stayed, got %', given; end if;
  raise notice 'E: player left mid-clues -- turn order stepped over them, round reached VOTING';
end;
$$;

do $$ begin raise notice 'ALL BRANCHES PASSED'; end; $$;

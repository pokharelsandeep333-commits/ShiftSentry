\set ON_ERROR_STOP on

-- The host can bail out of a round mid-play and deal again --------------------
do $$
declare
  deal record;
  host constant uuid := '11111111-1111-1111-1111-111111111111';
  other constant uuid := '22222222-2222-2222-2222-222222222222';
  phase text;
  room_phase text;
  marked timestamptz;
  scored integer;
  clues_kept integer;
  next_round uuid;
  next_no integer;
  failed boolean;
begin
  select * into deal from test_deal('NONE', false, true, 1, 2, 4);

  -- One clue in, so the round is genuinely underway rather than freshly dealt.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', public.game_round_turn(deal.round_id)::text, true);
  perform public.submit_game_clue(deal.round_id, 'first clue');

  -- A player is not a host.
  failed := false;
  perform set_config('request.jwt.claim.sub', other::text, true);
  begin
    perform public.abandon_game_round(deal.round_id);
  exception when others then
    failed := true;
  end;
  if not failed then raise exception 'a non-host ended the round'; end if;

  execute 'set local role postgres';
  select status::text into phase from public.game_rounds where id = deal.round_id;
  if phase <> 'CLUES' then raise exception 'the failed attempt moved the round to %', phase; end if;
  raise notice 'a player cannot end the round';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', host::text, true);
  perform public.abandon_game_round(deal.round_id);

  execute 'set local role postgres';
  select status::text, abandoned_at into phase, marked
    from public.game_rounds where id = deal.round_id;
  select status::text into room_phase from public.game_rooms where id = deal.room_id;
  select count(*) into clues_kept from public.game_clues where round_id = deal.round_id;

  if phase <> 'ENDED' then raise exception 'the round is still %', phase; end if;
  if marked is null then raise exception 'the round was not marked abandoned'; end if;
  if room_phase <> 'LOBBY' then raise exception 'the room is % rather than LOBBY', room_phase; end if;
  if clues_kept <> 1 then raise exception 'the clues went with the round (%)', clues_kept; end if;
  raise notice 'the host ends the round mid-clues; room back to LOBBY, clues kept';

  -- It scores for nobody.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', host::text, true);
  select count(*) into scored from public.game_room_scoreboard(deal.room_id);
  if scored <> 0 then raise exception 'an abandoned round put % players on the scoreboard', scored; end if;
  raise notice 'an abandoned round scores for nobody';

  -- Ending it twice is refused.
  failed := false;
  begin
    perform public.abandon_game_round(deal.round_id);
  exception when others then
    failed := true;
  end;
  if not failed then raise exception 'a finished round was ended again'; end if;
  raise notice 'a round already over cannot be ended again';

  -- And the room plays on: settings change, next round deals from the lobby.
  perform public.update_game_room_settings(
    deal.room_id, 'CATEGORY', false, true, 1, 1, 20, true, false, 'HARD', null);
  next_round := public.start_game_round(deal.room_id);

  execute 'set local role postgres';
  select round_no into next_no from public.game_rounds where id = next_round;
  if next_no <> 2 then raise exception 'the next round is numbered %', next_no; end if;
  select status::text into room_phase from public.game_rooms where id = deal.room_id;
  if room_phase <> 'PLAYING' then raise exception 'the room did not start playing again (%)', room_phase; end if;
  raise notice 'settings change and round 2 deals in the same room';
end;
$$;

-- A round that already has a result keeps it ---------------------------------
--
-- The host tapping "back to lobby" at the moment the last vote lands is a real
-- race. Losing it should close the round the ordinary way, not blank the result.
do $$
declare
  deal record;
  host constant uuid := '11111111-1111-1111-1111-111111111111';
  seats uuid[];
  target uuid;
  i integer;
  phase text;
  won text;
  marked timestamptz;
begin
  select * into deal from test_deal('NONE', false, false, 1, 1, 4);
  perform test_all_clues(deal.round_id);

  execute 'set local role postgres';
  select array_agg(user_id order by turn_order) into seats
    from public.game_round_players
    where round_id = deal.round_id and eliminated_at is null;
  target := deal.imposter_ids[1];

  -- Everyone but the imposter votes for the imposter, and the imposter votes
  -- elsewhere -- the vote only resolves once every seat has cast one.
  execute 'set local role authenticated';
  for i in 1..array_length(seats, 1) loop
    perform set_config('request.jwt.claim.sub', seats[i]::text, true);
    if seats[i] <> target then
      perform public.submit_game_vote(deal.round_id, target);
    else
      perform public.submit_game_vote(deal.round_id, (select other from unnest(seats) other where other <> target limit 1));
    end if;
  end loop;

  execute 'set local role postgres';
  select status::text, outcome into phase, won from public.game_rounds where id = deal.round_id;
  if phase <> 'REVEAL' then raise exception 'expected REVEAL, got %', phase; end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', host::text, true);
  perform public.abandon_game_round(deal.round_id);

  execute 'set local role postgres';
  select status::text, outcome, abandoned_at into phase, won, marked
    from public.game_rounds where id = deal.round_id;

  if phase <> 'ENDED' then raise exception 'the revealed round is still %', phase; end if;
  if won <> 'CREW_WIN' then raise exception 'the result was lost (%)', coalesce(won, 'null'); end if;
  if marked is not null then raise exception 'a decided round was marked abandoned'; end if;
  raise notice 'ending a revealed round keeps its result and does not mark it abandoned';
end;
$$;

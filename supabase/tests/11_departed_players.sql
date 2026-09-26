\set ON_ERROR_STOP on

-- A player who leaves the room leaves the round with it.
--
-- Pins section 4 of 20260926120000. Before it, a kicked player kept a round
-- seat that only the turn order looked past: they could still vote, read the
-- crew word after the host re-rolled it, and -- if caught -- guess from outside
-- the room.

-- Test-only helper: every seat still in the room votes for p_target, and
-- p_target votes for somebody else. Leaves the role as postgres.
create or replace function test_vote_out(p_round uuid, p_target uuid)
returns void
language plpgsql
as $$
declare
  seats uuid[];
  who uuid;
begin
  execute 'set local role postgres';
  select array_agg(seat.user_id order by seat.user_id) into seats
    from public.game_round_players seat
    join public.game_rounds round on round.id = seat.round_id
    join public.game_room_players member on member.room_id = round.room_id and member.user_id = seat.user_id
    where seat.round_id = p_round;

  execute 'set local role authenticated';
  foreach who in array seats loop
    perform set_config('request.jwt.claim.sub', who::text, true);
    perform public.submit_game_vote(
      p_round,
      case when who = p_target then (select s from unnest(seats) s where s <> p_target limit 1) else p_target end
    );
  end loop;
  execute 'set local role postgres';
end;
$$;

-- A: a kicked player's secret goes with them, re-roll included -------------
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  deal record; victim uuid; bystander uuid; seen integer; held text; answer text;
begin
  select * into deal from test_deal('NONE', false, true, 1, 1, 4);

  select user_id into victim from public.game_round_players
   where round_id = deal.round_id and user_id <> alice and user_id <> all(deal.imposter_ids)
   order by user_id limit 1;
  select user_id into bystander from public.game_round_players
   where round_id = deal.round_id and user_id not in (alice, victim) and user_id <> all(deal.imposter_ids)
   order by user_id limit 1;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', victim::text, true);
  select count(*) into seen from public.game_my_round_secret(deal.round_id);
  if seen <> 1 then raise exception 'A: a seated player could not read their own secret'; end if;

  perform set_config('request.jwt.claim.sub', alice::text, true);
  perform public.kick_game_player(deal.room_id, victim);

  perform set_config('request.jwt.claim.sub', victim::text, true);
  select count(*) into seen from public.game_my_round_secret(deal.round_id);
  if seen <> 0 then raise exception 'A: a kicked player can still read their word'; end if;

  perform set_config('request.jwt.claim.sub', alice::text, true);
  perform public.reroll_game_word(deal.round_id);

  perform set_config('request.jwt.claim.sub', victim::text, true);
  select count(*) into seen from public.game_my_round_secret(deal.round_id);
  if seen <> 0 then raise exception 'A: a kicked player read the re-rolled word'; end if;

  -- The crew still in the room do get the new word.
  perform set_config('request.jwt.claim.sub', bystander::text, true);
  select assigned_word into held from public.game_my_round_secret(deal.round_id);
  execute 'set local role postgres';
  select w.word into answer
    from public.game_rounds r join public.game_words w on w.id = r.word_id
   where r.id = deal.round_id;
  if held is distinct from answer then
    raise exception 'A: crew holds % after the re-roll, but the round word is %', held, answer;
  end if;
  raise notice 'A: a kicked player sees no secret, before or after a re-roll; the crew get the new word';
end;
$$;

-- B: a kicked player's ballots are withdrawn, and they are out of the vote --
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  deal record; victim uuid; others uuid[]; ballots integer; phase text; refused boolean;
begin
  select * into deal from test_deal('NONE', false, false, 1, 1, 5);
  perform test_all_clues(deal.round_id);

  select user_id into victim from public.game_round_players
   where round_id = deal.round_id and user_id <> alice
   order by user_id limit 1;
  select array_agg(user_id order by user_id) into others from public.game_round_players
   where round_id = deal.round_id and user_id not in (alice, victim);

  execute 'set local role authenticated';
  -- One ballot cast by the victim, one cast for them.
  perform set_config('request.jwt.claim.sub', victim::text, true);
  perform public.submit_game_vote(deal.round_id, alice);
  perform set_config('request.jwt.claim.sub', others[1]::text, true);
  perform public.submit_game_vote(deal.round_id, victim);

  perform set_config('request.jwt.claim.sub', alice::text, true);
  perform public.kick_game_player(deal.room_id, victim);

  execute 'set local role postgres';
  select count(*) into ballots from public.game_votes where round_id = deal.round_id;
  execute 'set local role authenticated';
  if ballots <> 0 then raise exception 'B: % ballot(s) by or for the kicked player survived', ballots; end if;

  -- They cannot vote from outside the room ...
  perform set_config('request.jwt.claim.sub', victim::text, true);
  refused := false;
  begin
    perform public.submit_game_vote(deal.round_id, alice);
  exception when sqlstate 'P0001' then
    if sqlerrm !~ 'not voting' then raise; end if;
    refused := true;
  end;
  if not refused then raise exception 'B: a kicked player cast a vote'; end if;

  -- ... and nobody can vote them out once they have gone.
  perform set_config('request.jwt.claim.sub', others[2]::text, true);
  refused := false;
  begin
    perform public.submit_game_vote(deal.round_id, victim);
  exception when sqlstate 'P0001' then
    if sqlerrm !~ 'not in this round' then raise; end if;
    refused := true;
  end;
  if not refused then raise exception 'B: a vote landed on a kicked player'; end if;
  raise notice 'B: the kicked player''s ballots are withdrawn; they cannot vote or be voted for';

  -- The four still playing settle it on their own.
  perform set_config('request.jwt.claim.sub', alice::text, true);
  perform public.submit_game_vote(deal.round_id, others[1]);
  perform set_config('request.jwt.claim.sub', others[1]::text, true);
  perform public.submit_game_vote(deal.round_id, others[2]);
  perform set_config('request.jwt.claim.sub', others[2]::text, true);
  perform public.submit_game_vote(deal.round_id, others[1]);
  perform set_config('request.jwt.claim.sub', others[3]::text, true);
  perform public.submit_game_vote(deal.round_id, others[1]);

  execute 'set local role postgres';
  select status::text into phase from public.game_rounds where id = deal.round_id;
  if phase <> 'REVEAL' then raise exception 'B: the four remaining votes left the round at %', phase; end if;
  raise notice 'B: the remaining four resolved the round without the kicked player';
end;
$$;

-- C: kicking the only player yet to vote resolves the round -----------------
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  deal record; holdout uuid; others uuid[]; phase text;
begin
  select * into deal from test_deal('NONE', false, false, 1, 1, 4);
  perform test_all_clues(deal.round_id);

  select user_id into holdout from public.game_round_players
   where round_id = deal.round_id and user_id <> alice
   order by user_id desc limit 1;
  select array_agg(user_id order by user_id) into others from public.game_round_players
   where round_id = deal.round_id and user_id not in (alice, holdout);

  -- Three of four vote, with a clear leader who is not the holdout.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', alice::text, true);
  perform public.submit_game_vote(deal.round_id, others[1]);
  perform set_config('request.jwt.claim.sub', others[1]::text, true);
  perform public.submit_game_vote(deal.round_id, others[2]);
  perform set_config('request.jwt.claim.sub', others[2]::text, true);
  perform public.submit_game_vote(deal.round_id, others[1]);

  execute 'set local role postgres';
  select status::text into phase from public.game_rounds where id = deal.round_id;
  if phase <> 'VOTING' then raise exception 'C: the round resolved at % before the holdout voted', phase; end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', alice::text, true);
  perform public.kick_game_player(deal.room_id, holdout);

  execute 'set local role postgres';
  select status::text into phase from public.game_rounds where id = deal.round_id;
  if phase <> 'REVEAL' then raise exception 'C: kicking the last holdout left the round at %', phase; end if;
  raise notice 'C: kicking the only player yet to vote resolved the round';
end;
$$;

-- D: a caught imposter who walks out forfeits the guess ----------------------
do $$
declare
  deal record; imposter uuid; phase text; result text; guessed text; answer text; refused boolean;
begin
  select * into deal from test_deal('NONE', false, true, 1, 1, 4);
  imposter := deal.imposter_ids[1];
  perform test_all_clues(deal.round_id);
  perform test_vote_out(deal.round_id, imposter);

  select status::text into phase from public.game_rounds where id = deal.round_id;
  if phase <> 'GUESSING' then raise exception 'D: expected GUESSING once the imposter was caught, got %', phase; end if;
  select w.word into answer
    from public.game_rounds r join public.game_words w on w.id = r.word_id
   where r.id = deal.round_id;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', imposter::text, true);
  perform public.leave_game_room(deal.room_id);

  execute 'set local role postgres';
  select status::text, outcome, final_guess into phase, result, guessed
    from public.game_rounds where id = deal.round_id;
  if phase <> 'REVEAL' or result is distinct from 'CREW_WIN' or guessed is not null then
    raise exception 'D: the caught imposter left and the round is % / % / guess %', phase, result, guessed;
  end if;

  -- And the guess they walked away from cannot be made afterwards.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', imposter::text, true);
  refused := false;
  begin
    perform public.submit_game_final_guess(deal.round_id, answer);
  exception when sqlstate 'P0001' then
    refused := true;
  end;
  if not refused then raise exception 'D: a departed imposter guessed after forfeiting'; end if;
  raise notice 'D: a caught imposter who leaves forfeits the guess; the crew win';
end;
$$;

-- E: the guess itself checks the room, not only caught_user_id ---------------
do $$
declare
  deal record; imposter uuid; phase text; answer text; refused boolean;
begin
  select * into deal from test_deal('NONE', false, true, 1, 1, 4);
  imposter := deal.imposter_ids[1];
  perform test_all_clues(deal.round_id);
  perform test_vote_out(deal.round_id, imposter);

  select w.word into answer
    from public.game_rounds r join public.game_words w on w.id = r.word_id
   where r.id = deal.round_id;

  -- A departure that skipped depart_game_room, so the round is still waiting on
  -- a guess from somebody who is no longer in the room.
  delete from public.game_room_players where room_id = deal.room_id and user_id = imposter;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', imposter::text, true);
  refused := false;
  begin
    perform public.submit_game_final_guess(deal.round_id, answer);
  exception when sqlstate 'P0001' then
    if sqlerrm !~ 'caught imposter' then raise; end if;
    refused := true;
  end;
  if not refused then raise exception 'E: a caught imposter outside the room guessed the word'; end if;

  execute 'set local role postgres';
  select status::text into phase from public.game_rounds where id = deal.round_id;
  if phase <> 'GUESSING' then raise exception 'E: a refused guess still moved the round to %', phase; end if;
  raise notice 'E: a caught imposter outside the room cannot guess, even with the right word';
end;
$$;

do $$ begin raise notice 'ALL DEPARTURE CHECKS PASSED'; end; $$;

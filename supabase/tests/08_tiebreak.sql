\set ON_ERROR_STOP on

-- Helper: everybody still standing votes, split evenly across two targets so the
-- round is guaranteed to deadlock. Even head counts only.
create or replace function test_tie_the_vote(p_round uuid)
returns void
language plpgsql
as $$
declare
  seats uuid[];
  half integer;
  i integer;
begin
  execute 'set local role postgres';
  select array_agg(user_id order by turn_order) into seats
    from public.game_round_players
    where round_id = p_round and eliminated_at is null;

  half := array_length(seats, 1) / 2;

  execute 'set local role authenticated';
  -- First half vote for seats[half+1], second half vote for seats[1]. Nobody
  -- votes for themselves, and the two targets finish level.
  for i in 1..array_length(seats, 1) loop
    perform set_config('request.jwt.claim.sub', seats[i]::text, true);
    if i <= half then
      perform public.submit_game_vote(p_round, seats[half + 1]);
    else
      perform public.submit_game_vote(p_round, seats[1]);
    end if;
  end loop;
  execute 'set local role postgres';
end;
$$;

-- A tie sends the round back for one more clue each ------------------------
do $$
declare
  deal record;
  phase text;
  pass_before integer;
  pass_after integer;
  ties integer;
  votes integer;
  eliminated integer;
  given integer;
begin
  -- Four players, one pass configured, so a tie is the only way to add one.
  select * into deal from test_deal('NONE', false, true, 1, 1, 4);
  perform test_all_clues(deal.round_id);

  select status::text, current_pass into phase, pass_before
    from public.game_rounds where id = deal.round_id;
  if phase <> 'VOTING' then raise exception 'expected VOTING, got %', phase; end if;

  perform test_tie_the_vote(deal.round_id);

  select status::text, current_pass, tiebreak_count
    into phase, pass_after, ties
    from public.game_rounds where id = deal.round_id;
  select count(*) into votes from public.game_votes where round_id = deal.round_id;
  select count(*) into eliminated from public.game_round_players
   where round_id = deal.round_id and eliminated_at is not null;

  if phase <> 'CLUES' then raise exception 'a tie did not reopen the clues (%)', phase; end if;
  if pass_after <> pass_before + 1 then raise exception 'the pass did not advance'; end if;
  if ties <> 1 then raise exception 'tiebreak was not counted (%)', ties; end if;
  if votes <> 0 then raise exception '% stale votes survived the tie', votes; end if;
  if eliminated <> 0 then raise exception 'a tie eliminated % players', eliminated; end if;
  raise notice 'tie -> back to CLUES, pass % -> %, votes cleared, nobody out', pass_before, pass_after;

  -- Everyone is still in, so the extra pass takes a clue from all four.
  given := test_all_clues(deal.round_id);
  if given <> 4 then raise exception 'the extra pass took % clues, expected 4', given; end if;

  select status::text into phase from public.game_rounds where id = deal.round_id;
  if phase <> 'VOTING' then raise exception 'the extra pass did not lead back to the vote (%)', phase; end if;
  raise notice 'the extra pass took 4 clues and opened the vote again';
end;
$$;

-- A decisive vote after a tiebreak settles it normally ---------------------
do $$
declare
  deal record; imposter uuid; others uuid[]; who uuid; phase text; result text; ties integer;
begin
  select * into deal from test_deal('NONE', false, false, 1, 1, 4);
  imposter := deal.imposter_ids[1];
  perform test_all_clues(deal.round_id);
  perform test_tie_the_vote(deal.round_id);
  perform test_all_clues(deal.round_id);

  select array_agg(user_id) into others from public.game_round_players
   where round_id = deal.round_id and user_id <> imposter;

  execute 'set local role authenticated';
  foreach who in array others loop
    perform set_config('request.jwt.claim.sub', who::text, true);
    perform public.submit_game_vote(deal.round_id, imposter);
  end loop;
  perform set_config('request.jwt.claim.sub', imposter::text, true);
  perform public.submit_game_vote(deal.round_id, others[1]);

  execute 'set local role postgres';
  select status::text, outcome, tiebreak_count into phase, result, ties
    from public.game_rounds where id = deal.round_id;

  if phase <> 'REVEAL' or result <> 'CREW_WIN' then
    raise exception 'the second vote did not settle it (% / %)', phase, result;
  end if;
  if ties <> 1 then raise exception 'tiebreak count was %, expected 1', ties; end if;
  raise notice 'a decisive second vote settled it -> CREW_WIN after 1 tiebreak';
end;
$$;

-- Tiebreaks are capped, and the third tie falls to the imposters -----------
do $$
declare
  deal record; phase text; result text; ties integer; i integer;
begin
  select * into deal from test_deal('NONE', false, true, 1, 1, 4);

  -- Tie, extra pass, tie, extra pass, tie. The third one has nowhere left to go.
  for i in 1..3 loop
    perform test_all_clues(deal.round_id);
    perform test_tie_the_vote(deal.round_id);

    select status::text, tiebreak_count into phase, ties
      from public.game_rounds where id = deal.round_id;

    if i < 3 and phase <> 'CLUES' then
      raise exception 'tie % did not extend the round (%)', i, phase;
    end if;
  end loop;

  select status::text, outcome, tiebreak_count into phase, result, ties
    from public.game_rounds where id = deal.round_id;

  if phase <> 'REVEAL' or result <> 'IMPOSTER_WIN' then
    raise exception 'the capped tie did not fall to the imposters (% / %)', phase, result;
  end if;
  if ties <> 2 then raise exception 'expected 2 tiebreaks used, got %', ties; end if;
  raise notice 'two tiebreaks used, third tie -> IMPOSTER_WIN';
end;
$$;

-- The cap is enforced by the column too, not only by the function ----------
do $$
declare
  deal record;
begin
  select * into deal from test_deal('NONE', false, true, 1, 1, 4);
  begin
    update public.game_rounds set tiebreak_count = 3 where id = deal.round_id;
    raise exception 'tiebreak_count accepted a value past the cap';
  exception when check_violation then
    raise notice 'the column refuses a tiebreak count past the cap';
  end;
end;
$$;

do $$ begin raise notice 'TIEBREAK PASSED'; end; $$;

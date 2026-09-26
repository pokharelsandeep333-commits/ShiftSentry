\set ON_ERROR_STOP on

-- A departure that completes a clue pass moves the round on.
--
-- Pins 20260926140000. submit_game_clue advances the pass only right after it
-- inserts a clue, and game_round_turn steps over anyone no longer in the room.
-- So when the one player still owing a clue walked out, the turn came back null
-- for everybody, nobody could give a clue, and nothing moved the round: it sat
-- in CLUES until the host abandoned it. 03_branches E covers a leaver who was
-- not last in the pass; these cover the one who was.

-- Test-only helper: gives clues in turn until exactly one seat still in the room
-- owes a clue for the current pass, and returns that player. Leaves the role as
-- postgres.
create or replace function test_clues_until_last(p_round uuid)
returns uuid
language plpgsql
as $$
declare
  observer uuid;
  turn uuid;
  owing integer;
  given integer;
begin
  execute 'set local role postgres';
  select count(*) into given from public.game_clues where round_id = p_round;

  loop
    execute 'set local role postgres';
    select member.user_id into observer
      from public.game_room_players member
      join public.game_rounds round on round.room_id = member.room_id
      where round.id = p_round
      order by member.user_id
      limit 1;

    select count(*) into owing
      from public.game_round_players seat
      join public.game_rounds round on round.id = seat.round_id
      where seat.round_id = p_round
        and seat.eliminated_at is null
        and exists (
          select 1 from public.game_room_players member
          where member.room_id = round.room_id and member.user_id = seat.user_id
        )
        and not exists (
          select 1 from public.game_clues clue
          where clue.round_id = p_round
            and clue.user_id = seat.user_id
            and clue.pass_no = round.current_pass
        );

    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub', observer::text, true);
    turn := public.game_round_turn(p_round);

    if owing <= 1 then
      execute 'set local role postgres';
      return turn;
    end if;

    perform set_config('request.jwt.claim.sub', turn::text, true);
    given := given + 1;
    perform public.submit_game_clue(p_round, 'clue ' || given);
  end loop;
end;
$$;

-- A: the last player owing the final pass leaves -> VOTING ------------------
do $$
declare
  deal record; owes_last uuid; phase text;
begin
  select * into deal from test_deal('NONE', false, true, 1, 1, 4);
  owes_last := test_clues_until_last(deal.round_id);

  select status::text into phase from public.game_rounds where id = deal.round_id;
  if phase <> 'CLUES' then raise exception 'A: expected CLUES with one clue owed, got %', phase; end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', owes_last::text, true);
  perform public.leave_game_room(deal.room_id);

  execute 'set local role postgres';
  select status::text into phase from public.game_rounds where id = deal.round_id;
  if phase <> 'VOTING' then
    raise exception 'A: the last player owing a clue left and the round stalled at %', phase;
  end if;
  raise notice 'A: the last player owing a clue left; the round moved to VOTING';
end;
$$;

-- B: kicked instead, with a discussion phase -> DISCUSSION ------------------
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  deal record; owes_last uuid; alice_order integer; phase text;
begin
  select * into deal from test_deal('NONE', false, true, 1, 1, 4, true, true);

  -- Seat the host first so she is never the one left owing: she cannot kick
  -- herself. Three steps because (round_id, turn_order) is unique.
  select turn_order into alice_order from public.game_round_players
   where round_id = deal.round_id and user_id = alice;
  if alice_order <> 1 then
    update public.game_round_players set turn_order = 1000
     where round_id = deal.round_id and user_id = alice;
    update public.game_round_players set turn_order = alice_order
     where round_id = deal.round_id and turn_order = 1;
    update public.game_round_players set turn_order = 1
     where round_id = deal.round_id and user_id = alice;
  end if;

  owes_last := test_clues_until_last(deal.round_id);
  if owes_last = alice then raise exception 'B: setup left the host owing the last clue'; end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', alice::text, true);
  perform public.kick_game_player(deal.room_id, owes_last);

  execute 'set local role postgres';
  select status::text into phase from public.game_rounds where id = deal.round_id;
  if phase <> 'DISCUSSION' then
    raise exception 'B: kicking the last player owing a clue left the round at %, expected DISCUSSION', phase;
  end if;
  raise notice 'B: kicking the last player owing a clue opened the discussion';
end;
$$;

-- C: mid-round, the pass advances and the rest play on ----------------------
do $$
declare
  deal record; owes_last uuid; phase text; pass integer; turn uuid; observer uuid; given integer;
begin
  select * into deal from test_deal('NONE', false, true, 1, 2, 4);
  owes_last := test_clues_until_last(deal.round_id);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', owes_last::text, true);
  perform public.leave_game_room(deal.room_id);

  execute 'set local role postgres';
  select status::text, current_pass into phase, pass from public.game_rounds where id = deal.round_id;
  if phase <> 'CLUES' or pass <> 2 then
    raise exception 'C: after pass 1 completed by a departure the round is % on pass %', phase, pass;
  end if;

  select user_id into observer from public.game_room_players where room_id = deal.room_id limit 1;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', observer::text, true);
  turn := public.game_round_turn(deal.round_id);
  if turn is null then raise exception 'C: pass 2 opened with nobody to speak'; end if;

  given := test_all_clues(deal.round_id);
  select status::text into phase from public.game_rounds where id = deal.round_id;
  if given <> 3 then raise exception 'C: expected 3 clues from the 3 who stayed, got %', given; end if;
  if phase <> 'VOTING' then raise exception 'C: pass 2 finished but the round is at %', phase; end if;
  raise notice 'C: a departure completed pass 1; pass 2 opened, the three who stayed finished it';
end;
$$;

-- D: a re-roll racing a departure does not deadlock -------------------------
--
-- The departure now locks the round in CLUES, which is exactly when a re-roll
-- runs. The re-roll used to lock the round and then, inside draw_game_word, the
-- room -- the reverse of depart_game_room's room-then-round. Here the leaver's
-- connection holds the room lock first, standing in for depart_game_room caught
-- between its two locks, while the host re-rolls. With the re-roll taking the
-- room first as well, it just waits; in the old order it held the round, and
-- the two waited on each other until Postgres killed one.

create temp table reroll_race (room_id uuid, round_id uuid, leaver uuid);

do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  deal record;
begin
  select * into deal from test_deal('NONE', false, true, 1, 1, 4);
  insert into reroll_race
    select deal.room_id, deal.round_id, user_id
      from public.game_round_players
      where round_id = deal.round_id and user_id <> alice
      order by user_id
      limit 1;
end;
$$;

do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  race record; queued boolean; leave_error text; reroll_error text;
  word_before bigint; word_after bigint; seated integer;
begin
  select * into race from reroll_race;
  select word_id into word_before from public.game_rounds where id = race.round_id;

  perform test_connect_as('first', race.leaver);
  perform dblink_exec('first', 'begin');
  perform * from dblink('first', format('select pg_advisory_xact_lock(hashtext(%L))', race.room_id)) as t(v text);

  perform test_connect_as('second', alice);
  perform dblink_send_query('second', format('select public.reroll_game_word(%L)', race.round_id));
  queued := test_await_advisory_waiter();

  begin
    perform * from dblink('first', format('select public.leave_game_room(%L)', race.room_id)) as t(v text);
    perform dblink_exec('first', 'commit');
  exception when others then
    leave_error := sqlerrm;
    perform dblink_exec('first', 'rollback');
  end;

  begin
    perform * from dblink_get_result('second') as t(v text);
  exception when others then
    reroll_error := sqlerrm;
  end;

  perform dblink_disconnect('first');
  perform dblink_disconnect('second');

  if not queued then raise exception 'D: the re-roll never waited, so this case proved nothing'; end if;
  if leave_error is not null then raise exception 'D: the departure failed: %', leave_error; end if;
  if reroll_error is not null then raise exception 'D: the re-roll failed: %', reroll_error; end if;

  select count(*) into seated from public.game_room_players where room_id = race.room_id and user_id = race.leaver;
  select word_id into word_after from public.game_rounds where id = race.round_id;
  if seated <> 0 then raise exception 'D: the leaver is still seated'; end if;
  if word_after = word_before then raise exception 'D: the re-roll did not apply after the departure'; end if;
  raise notice 'D: a re-roll racing a departure queued behind it, then applied -- no deadlock';
end;
$$;

do $$ begin raise notice 'ALL CLUE-PASS DEPARTURE CHECKS PASSED'; end; $$;

\set ON_ERROR_STOP on

-- The hint ladder: each rung gives the imposter strictly more -------------
--
-- Variables are named away from the column names they compare against --
-- `real_word` rather than `word` -- because a bare identifier inside a query is
-- resolved against both the plpgsql variable and the table column, and Postgres
-- rejects the ambiguity rather than guessing.
do $$
declare
  deal record; imposter uuid;
  real_word text; decoy_text text; word_category text;
  held_word text; hint_text text; matches integer;
begin
  -- NONE: nothing at all
  select * into deal from test_deal('NONE', false, true, 1, 1, 4);
  imposter := deal.imposter_ids[1];
  select assigned_word, category_hint_text into held_word, hint_text
    from public.game_round_secrets where round_id = deal.round_id and user_id = imposter;
  if held_word is not null or hint_text is not null then
    raise exception 'NONE gave the imposter word=% hint=%', held_word, hint_text;
  end if;
  raise notice 'NONE: imposter gets nothing';

  -- CATEGORY: the category, still no word
  select * into deal from test_deal('CATEGORY', false, true, 1, 1, 4);
  imposter := deal.imposter_ids[1];
  select assigned_word, category_hint_text into held_word, hint_text
    from public.game_round_secrets where round_id = deal.round_id and user_id = imposter;
  select w.category into word_category
    from public.game_rounds r join public.game_words w on w.id = r.word_id where r.id = deal.round_id;
  if held_word is not null then raise exception 'CATEGORY handed over a word'; end if;
  if hint_text is distinct from word_category then
    raise exception 'CATEGORY hint was % not %', hint_text, word_category;
  end if;
  raise notice 'CATEGORY: hint is the category (%), still no word', hint_text;

  -- RELATED: a real word from the same category, and never the answer
  select * into deal from test_deal('RELATED', false, true, 1, 1, 4);
  imposter := deal.imposter_ids[1];
  select assigned_word, category_hint_text into held_word, hint_text
    from public.game_round_secrets where round_id = deal.round_id and user_id = imposter;
  select w.word, w.category into real_word, word_category
    from public.game_rounds r join public.game_words w on w.id = r.word_id where r.id = deal.round_id;
  if held_word is not null then raise exception 'RELATED handed over a word'; end if;
  if hint_text is null then raise exception 'RELATED gave no hint'; end if;
  if lower(hint_text) = lower(real_word) then raise exception 'RELATED leaked the answer'; end if;

  select count(*) into matches
    from public.game_words gw
    where lower(gw.word) = lower(hint_text)
      and gw.category = word_category;
  if matches = 0 then
    raise exception 'RELATED hint "%" is not a word in category "%"', hint_text, word_category;
  end if;
  raise notice 'RELATED: hint "%" is a real same-category word, not the answer "%"', hint_text, real_word;

  -- DECOY: the decoy itself, and only here is a word handed over
  select * into deal from test_deal('DECOY', false, true, 1, 1, 4);
  imposter := deal.imposter_ids[1];
  select assigned_word, category_hint_text into held_word, hint_text
    from public.game_round_secrets where round_id = deal.round_id and user_id = imposter;
  select w.word, w.decoy_word into real_word, decoy_text
    from public.game_rounds r join public.game_words w on w.id = r.word_id where r.id = deal.round_id;
  if held_word is distinct from decoy_text then
    raise exception 'DECOY gave % not %', held_word, decoy_text;
  end if;
  if held_word = real_word then raise exception 'DECOY handed over the real word'; end if;
  if hint_text is not null then raise exception 'DECOY also gave a text hint'; end if;
  raise notice 'DECOY: imposter holds "%", crew hold "%"', held_word, real_word;
end;
$$;

-- Hidden roles are actually withheld, not just hidden in the markup --------
do $$
declare
  deal record; imposter uuid; crew uuid; secret record; seen integer;
begin
  select * into deal from test_deal('DECOY', true, false, 1, 1, 4);
  imposter := deal.imposter_ids[1];
  select user_id into crew from public.game_round_players
   where round_id = deal.round_id and user_id <> imposter limit 1;

  execute 'set local role authenticated';

  -- The table itself is unreachable now, whatever the policy says.
  perform set_config('request.jwt.claim.sub', imposter::text, true);
  begin
    select count(*) into seen from public.game_round_secrets;
    raise exception 'LEAK: game_round_secrets is still selectable';
  exception when insufficient_privilege then
    raise notice 'game_round_secrets is unreachable directly';
  end;

  -- ...and the function withholds the role while the round is live.
  select * into secret from public.game_my_round_secret(deal.round_id);
  if secret.role is not null then
    raise exception 'LEAK: hidden round told the imposter they are %', secret.role;
  end if;
  if secret.assigned_word is null then
    raise exception 'hidden round left the imposter with no word to hide behind';
  end if;
  if not secret.roles_hidden then raise exception 'roles_hidden was not reported'; end if;
  raise notice 'hidden round: imposter holds "%" and is told no role', secret.assigned_word;

  perform set_config('request.jwt.claim.sub', crew::text, true);
  select * into secret from public.game_my_round_secret(deal.round_id);
  if secret.role is not null then raise exception 'LEAK: crew were told their role'; end if;
  raise notice 'hidden round: crew are told no role either -- nobody knows';

  -- At the reveal the role comes back.
  execute 'set local role postgres';
  update public.game_rounds set status = 'REVEAL', outcome = 'CREW_WIN' where id = deal.round_id;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', imposter::text, true);
  select * into secret from public.game_my_round_secret(deal.round_id);
  if secret.role <> 'IMPOSTER' then raise exception 'reveal did not restore the role'; end if;
  raise notice 'at the reveal the role is released (%)', secret.role;
end;
$$;

-- A round that does not hide roles still reports them ----------------------
do $$
declare
  deal record; imposter uuid; secret record;
begin
  select * into deal from test_deal('DECOY', false, true, 1, 1, 4);
  imposter := deal.imposter_ids[1];
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', imposter::text, true);
  select * into secret from public.game_my_round_secret(deal.round_id);
  if secret.role <> 'IMPOSTER' then raise exception 'visible round withheld the role'; end if;
  if secret.roles_hidden then raise exception 'roles_hidden set on a visible round'; end if;
  raise notice 'roles visible when the host did not hide them';
end;
$$;

-- Hiding roles without a decoy is refused ----------------------------------
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  new_code text; room uuid;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', alice::text, true);
  new_code := public.create_game_room('Alice');
  execute 'set local role postgres';
  select id into room from public.game_rooms where game_rooms.code = new_code;
  execute 'set local role authenticated';

  foreach new_code in array array['NONE', 'CATEGORY', 'RELATED'] loop
    begin
      perform public.update_game_room_settings(room, new_code, true, true, 1, 1, 8, true, false, 'HARD', null);
      raise exception 'hide_roles was accepted with hint %', new_code;
    exception when sqlstate 'P0001' then
      if sqlerrm !~ 'decoy' then raise; end if;
    end;
  end loop;
  raise notice 'hide_roles refused on every rung except DECOY';

  perform public.update_game_room_settings(room, 'DECOY', true, true, 1, 1, 8, true, false, 'HARD', null);
  raise notice 'hide_roles accepted with DECOY';
end;
$$;

-- Duplicate clues -----------------------------------------------------------
do $$
declare
  deal record; turn uuid; first_player uuid;
begin
  select * into deal from test_deal('NONE', false, true, 1, 1, 4);
  execute 'set local role authenticated';

  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  turn := public.game_round_turn(deal.round_id);
  first_player := turn;
  perform set_config('request.jwt.claim.sub', turn::text, true);
  perform public.submit_game_clue(deal.round_id, 'Round');

  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  turn := public.game_round_turn(deal.round_id);
  perform set_config('request.jwt.claim.sub', turn::text, true);
  begin
    -- Different case and spacing: still the same clue.
    perform public.submit_game_clue(deal.round_id, '  round  ');
    raise exception 'a repeated clue was accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm !~ 'already said' then raise; end if;
    raise notice 'repeat refused, ignoring case and spacing';
  end;
  perform public.submit_game_clue(deal.round_id, 'circle');
  raise notice 'a different clue is accepted';

  -- With the setting off, repeats are allowed again.
  select * into deal from test_deal('NONE', false, true, 1, 1, 4, false, false);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  turn := public.game_round_turn(deal.round_id);
  perform set_config('request.jwt.claim.sub', turn::text, true);
  perform public.submit_game_clue(deal.round_id, 'same');
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  turn := public.game_round_turn(deal.round_id);
  perform set_config('request.jwt.claim.sub', turn::text, true);
  perform public.submit_game_clue(deal.round_id, 'same');
  raise notice 'repeats allowed when the host turns the rule off';
end;
$$;

-- Discussion phase ----------------------------------------------------------
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  deal record; phase text; seats uuid[];
begin
  select * into deal from test_deal('NONE', false, true, 1, 1, 4, true, true);
  perform test_all_clues(deal.round_id);

  select status::text into phase from public.game_rounds where id = deal.round_id;
  if phase <> 'DISCUSSION' then raise exception 'clues did not lead into discussion (%)', phase; end if;
  raise notice 'clues finished into DISCUSSION, not straight to the vote';

  select array_agg(user_id order by turn_order) into seats
    from public.game_round_players where round_id = deal.round_id;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', seats[1]::text, true);
  begin
    perform public.submit_game_vote(deal.round_id, seats[2]);
    raise exception 'a vote landed during discussion';
  exception when sqlstate 'P0001' then
    raise notice 'votes refused during discussion';
  end;

  -- Only the host closes it.
  perform set_config('request.jwt.claim.sub', seats[1]::text, true);
  if seats[1] <> alice then
    begin
      perform public.open_game_round_vote(deal.round_id);
      raise exception 'a non-host opened the vote';
    exception when sqlstate 'P0001' then
      raise notice 'non-host cannot open the vote';
    end;
  end if;

  perform set_config('request.jwt.claim.sub', alice::text, true);
  perform public.open_game_round_vote(deal.round_id);
  execute 'set local role postgres';
  select status::text into phase from public.game_rounds where id = deal.round_id;
  if phase <> 'VOTING' then raise exception 'host could not open the vote (%)', phase; end if;
  raise notice 'host opened the vote';
end;
$$;

-- Re-rolling the word -------------------------------------------------------
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  deal record; before_id bigint; after_id bigint;
  roles_before text; roles_after text; seats_before text; seats_after text;
  turn uuid;
begin
  select * into deal from test_deal('DECOY', false, true, 1, 1, 4);

  select word_id into before_id from public.game_rounds where id = deal.round_id;
  select string_agg(user_id::text || ':' || role::text, ',' order by user_id) into roles_before
    from public.game_round_secrets where round_id = deal.round_id;
  select string_agg(user_id::text || ':' || turn_order::text, ',' order by user_id) into seats_before
    from public.game_round_players where round_id = deal.round_id;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', alice::text, true);
  perform public.reroll_game_word(deal.round_id);

  execute 'set local role postgres';
  select word_id into after_id from public.game_rounds where id = deal.round_id;
  select string_agg(user_id::text || ':' || role::text, ',' order by user_id) into roles_after
    from public.game_round_secrets where round_id = deal.round_id;
  select string_agg(user_id::text || ':' || turn_order::text, ',' order by user_id) into seats_after
    from public.game_round_players where round_id = deal.round_id;

  if after_id = before_id then raise exception 're-roll drew the same word'; end if;
  if roles_after <> roles_before then raise exception 're-roll reshuffled the roles'; end if;
  if seats_after <> seats_before then raise exception 're-roll reshuffled the seating'; end if;

  -- The new word actually reached the players.
  if exists (
    select 1 from public.game_round_secrets s
    join public.game_words w on w.id = after_id
    where s.round_id = deal.round_id and s.role = 'CREW' and s.assigned_word is distinct from w.word
  ) then
    raise exception 're-roll left the crew holding the old word';
  end if;
  raise notice 're-roll swapped the word, kept roles and seating';

  -- Not once someone has spoken.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', alice::text, true);
  turn := public.game_round_turn(deal.round_id);
  perform set_config('request.jwt.claim.sub', turn::text, true);
  perform public.submit_game_clue(deal.round_id, 'spoken');

  perform set_config('request.jwt.claim.sub', alice::text, true);
  begin
    perform public.reroll_game_word(deal.round_id);
    raise exception 're-roll accepted after a clue was given';
  exception when sqlstate 'P0001' then
    raise notice 're-roll refused once a clue is in';
  end;

  -- And never by anyone else.
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  begin
    perform public.reroll_game_word(deal.round_id);
    raise exception 'a non-host re-rolled the word';
  exception when sqlstate 'P0001' then
    raise notice 're-roll refused for a non-host';
  end;
end;
$$;

-- Kicking -------------------------------------------------------------------
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  carol constant uuid := '33333333-3333-3333-3333-333333333333';
  new_code text; room uuid; seated integer;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', alice::text, true);
  new_code := public.create_game_room('Alice');
  execute 'set local role postgres';
  select id into room from public.game_rooms where game_rooms.code = new_code;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claim.sub', bob::text, true);
  perform public.join_game_room(new_code, 'Bob');
  perform set_config('request.jwt.claim.sub', carol::text, true);
  perform public.join_game_room(new_code, 'Carol');

  -- A player cannot kick anyone.
  perform set_config('request.jwt.claim.sub', bob::text, true);
  begin
    perform public.kick_game_player(room, carol);
    raise exception 'a non-host kicked somebody';
  exception when sqlstate 'P0001' then
    raise notice 'kick refused for a non-host';
  end;

  -- The host cannot kick themselves.
  perform set_config('request.jwt.claim.sub', alice::text, true);
  begin
    perform public.kick_game_player(room, alice);
    raise exception 'the host kicked themselves';
  exception when sqlstate 'P0001' then
    if sqlerrm !~ 'Leave game' then raise; end if;
    raise notice 'host is pointed at Leave game instead of kicking themselves';
  end;

  perform public.kick_game_player(room, carol);
  execute 'set local role postgres';
  select count(*) into seated from public.game_room_players where room_id = room;
  if seated <> 2 then raise exception 'kick left % players', seated; end if;

  -- And the kicked player can no longer see the room.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', carol::text, true);
  select count(*) into seated from public.game_rooms where id = room;
  if seated <> 0 then raise exception 'a kicked player can still see the room'; end if;
  raise notice 'kicked player removed and can no longer see the room';
end;
$$;

-- Scoreboard ----------------------------------------------------------------
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  deal record; imposter uuid; others uuid[]; who uuid;
  board record; total integer;
begin
  -- No final guess, so convicting the imposter settles it immediately.
  select * into deal from test_deal('NONE', false, false, 1, 1, 4);
  imposter := deal.imposter_ids[1];
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

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', alice::text, true);

  select count(*) into total from public.game_room_scoreboard(deal.room_id);
  if total <> 4 then raise exception 'scoreboard listed % players', total; end if;

  select * into board from public.game_room_scoreboard(deal.room_id) where user_id = imposter;
  if board.imposter_rounds <> 1 then raise exception 'imposter round not counted'; end if;
  if board.wins <> 0 then raise exception 'the caught imposter was credited a win'; end if;

  select * into board from public.game_room_scoreboard(deal.room_id) where user_id = others[1];
  if board.wins <> 1 then raise exception 'the crew were not credited the win'; end if;
  if board.imposter_rounds <> 0 then raise exception 'a crew member counted as an imposter'; end if;
  raise notice 'scoreboard: crew credited the win, caught imposter credited none';

  -- Not visible to somebody outside the room.
  perform set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', true);
  select count(*) into total from public.game_room_scoreboard(deal.room_id);
  if total <> 0 then raise exception 'LEAK: an outsider read % scoreboard rows', total; end if;
  raise notice 'scoreboard is empty for a non-member';
end;
$$;

do $$ begin raise notice 'SETTINGS AND CONTROLS PASSED'; end; $$;

\set ON_ERROR_STOP on

-- The word draw is internal.
--
-- Pins section 1 of 20260926120000. draw_game_word returns the id it drew and
-- burns it from the room's pool, so a host who could call it directly during a
-- round could list every unused id in the category and infer the live one by
-- elimination. Only start_game_round and reroll_game_word may reach it.

do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  deal record; burned_before integer; burned_after integer; refused boolean;
  first_word bigint; rerolled bigint;
begin
  if has_function_privilege('authenticated', 'public.draw_game_word(uuid)', 'execute') then
    raise exception 'LEAK: authenticated still holds EXECUTE on draw_game_word';
  end if;
  if has_function_privilege('anon', 'public.draw_game_word(uuid)', 'execute') then
    raise exception 'LEAK: anon holds EXECUTE on draw_game_word';
  end if;

  -- Dealing still draws through it, as the owner.
  select * into deal from test_deal('NONE', false, true, 1, 1, 3);
  select word_id into first_word from public.game_rounds where id = deal.round_id;
  if first_word is null then raise exception 'start_game_round dealt a round with no word'; end if;
  select count(*) into burned_before from public.game_room_used_words where room_id = deal.room_id;

  -- The host, mid-round, calling it straight through the API.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', alice::text, true);
  refused := false;
  begin
    perform public.draw_game_word(deal.room_id);
  exception when insufficient_privilege then
    refused := true;
  end;
  if not refused then raise exception 'LEAK: the host drew a word directly during a round'; end if;

  execute 'set local role postgres';
  select count(*) into burned_after from public.game_room_used_words where room_id = deal.room_id;
  if burned_after <> burned_before then
    raise exception 'a refused draw still burned % word(s)', burned_after - burned_before;
  end if;
  raise notice 'direct draw refused for the host, and nothing was burned';

  -- The re-roll, its other caller, still draws through it.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', alice::text, true);
  perform public.reroll_game_word(deal.round_id);

  execute 'set local role postgres';
  select word_id into rerolled from public.game_rounds where id = deal.round_id;
  if rerolled is null or rerolled = first_word then
    raise exception 're-roll did not draw a new word (still %)', rerolled;
  end if;
  raise notice 'start_game_round and reroll_game_word still draw as the owner';
end;
$$;

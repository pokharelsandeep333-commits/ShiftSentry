\set ON_ERROR_STOP on

do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  carol constant uuid := '33333333-3333-3333-3333-333333333333';
  dave  constant uuid := '44444444-4444-4444-4444-444444444444';
  room_code text;
  joined_code text;
  room uuid;
  seen integer;
  host_now uuid;
  drawn bigint;
  drawn_ids bigint[] := '{}';
  duplicates integer;
  bank integer;
  categories integer;
begin
  execute 'set local role authenticated';

  -- ---- word bank ------------------------------------------------------
  perform set_config('request.jwt.claim.sub', alice::text, true);

  begin
    select count(*) into bank from public.game_words;
    raise exception 'LEAK: authenticated can read the word bank';
  exception when insufficient_privilege then
    raise notice 'word bank is unreadable to authenticated (as designed)';
  end;

  select coalesce(sum(word_count), 0), count(*) into bank, categories from public.game_word_categories('HARD');
  raise notice 'word bank: % pairs across % categories', bank, categories;
  if bank <> 806 then raise exception 'expected 806 pairs, got %', bank; end if;
  if categories <> 17 then raise exception 'expected 17 categories, got %', categories; end if;

  -- ---- create ---------------------------------------------------------
  room_code := public.create_game_room('Alice');
  if room_code !~ '^[ABCDEFGHJKMNPQRSTVWXYZ23456789]{6}$' then
    raise exception 'bad room code %', room_code;
  end if;
  raise notice 'alice created room %', room_code;

  select id into room from public.game_rooms where code = room_code;
  select count(*) into seen from public.game_room_players where room_id = room;
  if seen <> 1 then raise exception 'host was not seated (% players)', seen; end if;

  -- ---- a non-member cannot see the room -------------------------------
  perform set_config('request.jwt.claim.sub', carol::text, true);
  select count(*) into seen from public.game_rooms where code = room_code;
  if seen <> 0 then raise exception 'RLS leak: non-member sees the room'; end if;
  raise notice 'non-member sees 0 rooms (RLS holds)';

  -- ---- join by code ---------------------------------------------------
  perform set_config('request.jwt.claim.sub', bob::text, true);
  joined_code := public.join_game_room(lower(room_code), 'Bob');
  if joined_code <> room_code then raise exception 'join returned %', joined_code; end if;

  select count(*) into seen from public.game_rooms where code = room_code;
  if seen <> 1 then raise exception 'joining did not make the room visible'; end if;

  -- re-joining is idempotent, not an error
  perform public.join_game_room(room_code, 'Bob Again');
  select count(*) into seen from public.game_room_players where room_id = room;
  if seen <> 2 then raise exception 'rejoin duplicated a seat (% players)', seen; end if;
  raise notice 'join + idempotent rejoin: 2 players';

  -- ---- capacity -------------------------------------------------------
  perform set_config('request.jwt.claim.sub', alice::text, true);
  perform public.update_game_room_settings(room, 'NONE', false, true, 1, 1, 3, true, false, 'HARD', null);

  perform set_config('request.jwt.claim.sub', carol::text, true);
  perform public.join_game_room(room_code, 'Carol');

  perform set_config('request.jwt.claim.sub', dave::text, true);
  begin
    perform public.join_game_room(room_code, 'Dave');
    raise exception 'capacity was not enforced';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'That game is full.' then raise; end if;
    raise notice 'capacity enforced: %', sqlerrm;
  end;

  -- ---- settings are host-only -----------------------------------------
  perform set_config('request.jwt.claim.sub', bob::text, true);
  begin
    perform public.update_game_room_settings(room, 'DECOY', false, true, 2, 2, 8, true, false, 'HARD', null);
    raise exception 'a non-host changed the settings';
  exception when sqlstate 'P0001' then
    raise notice 'settings refused for non-host: %', sqlerrm;
  end;

  -- ---- host succession -------------------------------------------------
  perform set_config('request.jwt.claim.sub', alice::text, true);
  perform public.leave_game_room(room);

  execute 'set local role postgres';
  select host_id into host_now from public.game_rooms where id = room;
  if host_now <> bob then raise exception 'host did not pass to the earliest joiner (got %)', host_now; end if;
  raise notice 'host passed from alice to bob';

  -- ---- word draw never repeats, then cycles ---------------------------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', bob::text, true);
  perform public.update_game_room_settings(room, 'NONE', false, true, 1, 1, 8, true, false, 'HARD', 'Clothing');

  select word_count into bank from public.game_word_categories('HARD') where category = 'Clothing';

  for i in 1..bank loop
    drawn := public.draw_game_word(room);
    drawn_ids := drawn_ids || drawn;
  end loop;

  select count(*) - count(distinct id) into duplicates
  from unnest(drawn_ids) as id;

  if duplicates <> 0 then raise exception '% repeats in a % word category', duplicates, bank; end if;
  raise notice 'drew all % Clothing words with no repeat', bank;

  -- one more must recycle rather than fail
  drawn := public.draw_game_word(room);
  if drawn is null then raise exception 'exhausted bank did not cycle'; end if;
  raise notice 'bank cycled cleanly on the next draw';

  raise notice 'ALL BEHAVIOUR CHECKS PASSED';
end;
$$;

\set ON_ERROR_STOP on

-- Topic parsing rejects everything that is not one of ours -------------------
do $$
begin
  if public.game_topic_room('game:11111111-1111-1111-1111-111111111111') is null then
    raise exception 'a valid topic was rejected';
  end if;
  if public.game_topic_room('game:not-a-uuid') is not null then raise exception 'junk uuid accepted'; end if;
  if public.game_topic_room('shifts:11111111-1111-1111-1111-111111111111') is not null then raise exception 'foreign topic accepted'; end if;
  if public.game_topic_room('') is not null then raise exception 'empty topic accepted'; end if;
  if public.game_topic_room(null) is not null then raise exception 'null topic accepted'; end if;
  if public.game_topic_room('game:11111111-1111-1111-1111-111111111111; drop table x') is not null then
    raise exception 'trailing junk accepted';
  end if;
  raise notice 'topic parsing: valid accepted, junk / foreign / injection-shaped rejected';
end;
$$;

-- Broadcasts fire, carry no row data, and land on the room's topic ------------
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  carol constant uuid := '33333333-3333-3333-3333-333333333333';
  new_code text;
  room uuid;
  round uuid;
  room_topic text;
  signals integer;
  tables text;
  leaked integer;
  turn uuid;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', alice::text, true);
  new_code := public.create_game_room('Alice');

  execute 'set local role postgres';
  select id into room from public.game_rooms where game_rooms.code = new_code;
  room_topic := 'game:' || room::text;
  delete from realtime.messages;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claim.sub', bob::text, true);
  perform public.join_game_room(new_code, 'Bob');
  perform set_config('request.jwt.claim.sub', carol::text, true);
  perform public.join_game_room(new_code, 'Carol');

  perform set_config('request.jwt.claim.sub', alice::text, true);
  round := public.start_game_round(room);

  loop
    perform set_config('request.jwt.claim.sub', alice::text, true);
    turn := public.game_round_turn(round);
    exit when turn is null;
    perform set_config('request.jwt.claim.sub', turn::text, true);
    perform public.submit_game_clue(round, 'clue');
  end loop;

  execute 'set local role postgres';

  select count(*) into signals from realtime.messages where realtime.messages.topic = room_topic;
  if signals = 0 then raise exception 'no broadcasts were sent'; end if;

  select count(*) into leaked from realtime.messages where realtime.messages.topic <> room_topic;
  if leaked <> 0 then raise exception '% broadcasts went to the wrong topic', leaked; end if;

  select string_agg(distinct payload ->> 'table', ', ' order by payload ->> 'table')
    into tables from realtime.messages;
  raise notice 'broadcasts: % signals, all on this room, from [%]', signals, tables;

  -- The payload must never carry row content -- only the table and the operation.
  select count(*) into leaked
    from realtime.messages
    where (select count(*) from jsonb_object_keys(payload)) <> 2
       or payload ? 'record'
       or payload ? 'old_record';
  if leaked <> 0 then raise exception '% payloads carried more than table+op', leaked; end if;
  raise notice 'every payload is exactly {table, op} -- no row data on the wire';

  if not exists (select 1 from realtime.messages where private is true) then
    raise exception 'broadcasts were not sent as private';
  end if;
  raise notice 'broadcasts are private, so the listen policy governs them';

  -- ---- who may listen -------------------------------------------------------
  execute 'set local role authenticated';
  perform set_config('realtime.topic', room_topic, true);

  perform set_config('request.jwt.claim.sub', bob::text, true);
  select count(*) into signals from realtime.messages;
  if signals = 0 then raise exception 'a room member could not receive its signals'; end if;
  raise notice 'a member receives the room signal (% visible)', signals;

  perform set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
  select count(*) into signals from realtime.messages;
  if signals <> 0 then raise exception 'LEAK: a non-member received % room signals', signals; end if;
  raise notice 'a non-member receives nothing';

  -- A member of this room listening on somebody else's topic gets nothing.
  perform set_config('request.jwt.claim.sub', bob::text, true);
  perform set_config('realtime.topic', 'game:99999999-9999-9999-9999-999999999999', true);
  select count(*) into signals from realtime.messages;
  if signals <> 0 then raise exception 'LEAK: wrong-topic subscription returned % rows', signals; end if;
  raise notice 'subscribing to another room''s topic returns nothing';
end;
$$;

-- Stale room cleanup ----------------------------------------------------------
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  new_code text;
  room uuid;
  closed integer;
  live integer;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', alice::text, true);
  new_code := public.create_game_room('Alice');

  execute 'set local role postgres';
  select id into room from public.game_rooms where game_rooms.code = new_code;

  -- A fresh room is left alone.
  closed := public.cleanup_stale_game_rooms(120);
  select count(*) into live from public.game_rooms where id = room and status <> 'ENDED';
  if live <> 1 then raise exception 'cleanup closed a room that was still active'; end if;
  raise notice 'cleanup left a fresh room alone (closed % others)', closed;

  -- Age the presence stamps past the window.
  update public.game_room_players set last_seen_at = now() - interval '5 hours' where room_id = room;
  update public.game_rooms set created_at = now() - interval '5 hours' where id = room;

  closed := public.cleanup_stale_game_rooms(120);
  select count(*) into live from public.game_rooms where id = room and status <> 'ENDED';
  if live <> 0 then raise exception 'cleanup did not close an abandoned room'; end if;
  raise notice 'cleanup closed the abandoned room';

  -- Its code is free again: the unique index only covers live rooms.
  if exists (select 1 from public.game_rooms where game_rooms.code = new_code and status <> 'ENDED') then
    raise exception 'code was not released';
  end if;
  raise notice 'the invite code is back in circulation';

  begin
    perform public.cleanup_stale_game_rooms(1);
    raise exception 'cleanup accepted a one-minute window';
  exception when sqlstate 'P0001' then
    if sqlerrm !~ 'five minutes' then raise; end if;
    raise notice 'cleanup refuses a window under five minutes';
  end;
end;
$$;

-- The cleanup job is not reachable by a player --------------------------------
do $$
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  begin
    perform public.cleanup_stale_game_rooms(120);
    raise exception 'LEAK: a player could end everyone''s rooms';
  exception when insufficient_privilege then
    raise notice 'cleanup is not callable by authenticated';
  end;
end;
$$;

do $$ begin raise notice 'PHASE 5 CHECKS PASSED'; end; $$;

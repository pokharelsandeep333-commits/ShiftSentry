\set ON_ERROR_STOP on

-- A heartbeat must not ring the room, and a player can rename only themselves.
--
-- The first half guards the fix in 20260913120000: before it, every
-- `poll_game_room` call fired the roster broadcast trigger, so an idle lobby
-- re-rendered itself on every player's heartbeat. The fingerprint test in
-- 07_room_version.sql covers the fallback poll; this one covers the socket.

do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  carol constant uuid := '33333333-3333-3333-3333-333333333333';
  room_code text;
  room uuid;
  room_topic text;
  signals integer;
  before_version text;
  after_version text;
  seat_name text;
  failed boolean;
  i integer;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', alice::text, true);
  room_code := public.create_game_room('Alice');
  perform set_config('request.jwt.claim.sub', bob::text, true);
  perform public.join_game_room(room_code, 'Bob');

  execute 'set local role postgres';
  select id into room from public.game_rooms where game_rooms.code = room_code;
  room_topic := 'game:' || room::text;
  delete from realtime.messages;
  execute 'set local role authenticated';

  -- ---- heartbeats are silent -------------------------------------------
  for i in 1..5 loop
    perform set_config('request.jwt.claim.sub', alice::text, true);
    perform public.poll_game_room(room);
    perform set_config('request.jwt.claim.sub', bob::text, true);
    perform public.poll_game_room(room);
  end loop;

  execute 'set local role postgres';
  select count(*) into signals from realtime.messages where topic = room_topic;
  execute 'set local role authenticated';
  if signals <> 0 then
    raise exception 'ten heartbeats rang the room % times', signals;
  end if;
  raise notice 'ten heartbeats, zero broadcasts';

  -- ---- a rename is not silent, and the fingerprint notices -------------
  perform set_config('request.jwt.claim.sub', bob::text, true);
  before_version := public.game_room_version(room);
  perform public.rename_game_player(room, '  Bobby  ');
  after_version := public.game_room_version(room);

  execute 'set local role postgres';
  select count(*) into signals from realtime.messages where topic = room_topic;
  select display_name into seat_name from public.game_room_players where room_id = room and user_id = bob;
  execute 'set local role authenticated';

  if signals <> 1 then raise exception 'a rename rang the room % times, expected once', signals; end if;
  if seat_name <> 'Bobby' then raise exception 'rename stored % rather than the trimmed name', seat_name; end if;
  if after_version = before_version then raise exception 'a rename did not change the fingerprint'; end if;
  raise notice 'rename: trimmed, stored, broadcast once, fingerprint moved';

  -- ---- only your own seat ---------------------------------------------------
  -- The function has no target parameter, so there is nothing to aim at
  -- somebody else; the check is that Bob's rename left Alice untouched.
  execute 'set local role postgres';
  select display_name into seat_name from public.game_room_players where room_id = room and user_id = alice;
  execute 'set local role authenticated';
  if seat_name <> 'Alice' then raise exception 'renaming Bob changed Alice to %', seat_name; end if;

  -- ---- a stranger cannot rename into a room they are not in -----------------
  perform set_config('request.jwt.claim.sub', carol::text, true);
  failed := false;
  begin
    perform public.rename_game_player(room, 'Carol');
  exception when others then
    failed := true;
  end;
  if not failed then raise exception 'a non-member renamed a seat'; end if;
  raise notice 'non-member rename refused';

  -- ---- blank is refused, long is truncated ----------------------------------
  perform set_config('request.jwt.claim.sub', bob::text, true);
  failed := false;
  begin
    perform public.rename_game_player(room, '   ');
  exception when others then
    failed := true;
  end;
  if not failed then raise exception 'a blank rename was accepted'; end if;

  perform public.rename_game_player(room, repeat('x', 60));
  execute 'set local role postgres';
  select display_name into seat_name from public.game_room_players where room_id = room and user_id = bob;
  execute 'set local role authenticated';
  if char_length(seat_name) <> 40 then raise exception 'long name stored at % characters', char_length(seat_name); end if;
  raise notice 'blank refused, long name cut to 40';

  -- ---- re-opening the invite link keeps the chosen name ---------------------
  perform public.rename_game_player(room, 'Bobby');
  perform public.join_game_room(room_code);
  execute 'set local role postgres';
  select display_name into seat_name from public.game_room_players where room_id = room and user_id = bob;
  execute 'set local role authenticated';
  if seat_name <> 'Bobby' then raise exception 'rejoining with no name overwrote the seat name with %', seat_name; end if;

  perform public.join_game_room(room_code, 'Robert');
  execute 'set local role postgres';
  select display_name into seat_name from public.game_room_players where room_id = room and user_id = bob;
  execute 'set local role authenticated';
  if seat_name <> 'Robert' then raise exception 'rejoining with an explicit name did not apply it: %', seat_name; end if;
  raise notice 'rejoin: bare keeps the name, explicit replaces it';
end;
$$;

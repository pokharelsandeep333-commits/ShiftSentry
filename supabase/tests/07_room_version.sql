\set ON_ERROR_STOP on

-- The fingerprint the fallback poll compares against.
--
-- The whole optimisation rests on one property: a heartbeat must not change it.
-- If it did, every tick would look like a change, every player would re-render
-- the page every 2.5 seconds, and the Server Action queue would stay busy enough
-- to make destructive buttons feel dead on a phone -- which is the bug this
-- exists to fix.

do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  carol constant uuid := '33333333-3333-3333-3333-333333333333';
  dave  constant uuid := '44444444-4444-4444-4444-444444444444';
  room_code text;
  room uuid;
  round uuid;
  before_version text;
  after_version text;
  turn uuid;
  i integer;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', alice::text, true);
  room_code := public.create_game_room('Alice');

  execute 'set local role postgres';
  select id into room from public.game_rooms where game_rooms.code = room_code;
  execute 'set local role authenticated';

  -- ---- a heartbeat is not a change ------------------------------------
  before_version := public.game_room_version(room);
  for i in 1..5 loop
    after_version := public.poll_game_room(room);
  end loop;

  if after_version is distinct from before_version then
    raise exception 'a heartbeat changed the fingerprint: % -> %', before_version, after_version;
  end if;
  raise notice 'five heartbeats left the fingerprint untouched';

  -- ---- but joining is ---------------------------------------------------
  perform set_config('request.jwt.claim.sub', bob::text, true);
  perform public.join_game_room(room_code, 'Bob');

  perform set_config('request.jwt.claim.sub', alice::text, true);
  after_version := public.game_room_version(room);
  if after_version = before_version then raise exception 'a player joining did not change the fingerprint'; end if;
  raise notice 'a player joining changed it';
  before_version := after_version;

  -- ---- so is a settings change -----------------------------------------
  perform public.update_game_room_settings(room, 'DECOY', false, true, 1, 1, 8, true, false, 'HARD', null);
  after_version := public.game_room_version(room);
  if after_version = before_version then raise exception 'a settings change did not change the fingerprint'; end if;
  raise notice 'a settings change changed it';
  before_version := after_version;

  -- ---- and dealing a round ----------------------------------------------
  perform set_config('request.jwt.claim.sub', carol::text, true);
  perform public.join_game_room(room_code, 'Carol');
  perform set_config('request.jwt.claim.sub', alice::text, true);
  round := public.start_game_round(room);

  after_version := public.game_room_version(room);
  if after_version = before_version then raise exception 'starting a round did not change the fingerprint'; end if;
  raise notice 'starting a round changed it';
  before_version := after_version;

  -- ---- a clue --------------------------------------------------------------
  turn := public.game_round_turn(round);
  perform set_config('request.jwt.claim.sub', turn::text, true);
  perform public.submit_game_clue(round, 'first');

  perform set_config('request.jwt.claim.sub', alice::text, true);
  after_version := public.game_room_version(room);
  if after_version = before_version then raise exception 'a clue did not change the fingerprint'; end if;
  raise notice 'a clue changed it';
  before_version := after_version;

  -- ...and heartbeats mid-round are still quiet.
  for i in 1..5 loop
    perform set_config('request.jwt.claim.sub', (array[alice, bob, carol])[1 + (i % 3)]::text, true);
    after_version := public.poll_game_room(room);
  end loop;
  perform set_config('request.jwt.claim.sub', alice::text, true);
  if public.game_room_version(room) is distinct from before_version then
    raise exception 'heartbeats during a round changed the fingerprint';
  end if;
  raise notice 'heartbeats during a live round are still quiet';

  -- ---- a vote --------------------------------------------------------------
  -- Numbered, not built from the uuid: 'clue ' plus a uuid is 41 characters and
  -- the clue limit is 40.
  i := 0;
  loop
    perform set_config('request.jwt.claim.sub', alice::text, true);
    turn := public.game_round_turn(round);
    exit when turn is null;
    i := i + 1;
    perform set_config('request.jwt.claim.sub', turn::text, true);
    perform public.submit_game_clue(round, 'clue ' || i);
  end loop;

  perform set_config('request.jwt.claim.sub', alice::text, true);
  before_version := public.game_room_version(room);

  perform set_config('request.jwt.claim.sub', bob::text, true);
  perform public.submit_game_vote(round, carol);

  perform set_config('request.jwt.claim.sub', alice::text, true);
  after_version := public.game_room_version(room);
  if after_version = before_version then raise exception 'a vote did not change the fingerprint'; end if;
  raise notice 'a vote changed it';

  -- ---- a stranger gets nothing at all -----------------------------------
  perform set_config('request.jwt.claim.sub', dave::text, true);
  if public.game_room_version(room) is not null then
    raise exception 'LEAK: a non-member read the room fingerprint';
  end if;
  raise notice 'a non-member gets null';
end;
$$;

-- Going away and coming back is a change, because a presence dot has to move.
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  room_code text; room uuid; before_version text;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', alice::text, true);
  room_code := public.create_game_room('Alice');
  execute 'set local role postgres';
  select id into room from public.game_rooms where game_rooms.code = room_code;
  execute 'set local role authenticated';

  perform set_config('request.jwt.claim.sub', bob::text, true);
  perform public.join_game_room(room_code, 'Bob');

  perform set_config('request.jwt.claim.sub', alice::text, true);
  before_version := public.game_room_version(room);

  -- Age Bob out of the presence window.
  execute 'set local role postgres';
  update public.game_room_players set last_seen_at = now() - interval '5 minutes'
   where room_id = room and user_id = bob;
  execute 'set local role authenticated';

  if public.game_room_version(room) = before_version then
    raise exception 'a player going away did not change the fingerprint';
  end if;
  raise notice 'a player going quiet changed it -- the dot needs to move';

  -- ...and their next heartbeat brings it back.
  perform set_config('request.jwt.claim.sub', bob::text, true);
  perform public.poll_game_room(room);
  perform set_config('request.jwt.claim.sub', alice::text, true);

  if public.game_room_version(room) <> before_version then
    raise exception 'coming back did not restore the fingerprint';
  end if;
  raise notice 'their heartbeat brought it back';
end;
$$;

do $$ begin raise notice 'ROOM VERSION PASSED'; end; $$;

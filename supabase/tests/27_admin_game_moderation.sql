\set ON_ERROR_STOP on

-- Imposter moderation (20261016130000): end a room, remove a player, reset a
-- name. Server only; a removal goes through depart_game_room (host passes on,
-- the room carries on); an ended room stays ended; and a removal racing the
-- player's own Leave serialises on the room lock instead of double-departing.

-- No API role can reach any of the three ------------------------------------
do $$
declare
  deal record;
  refused boolean;
  fn text;
begin
  select * into deal from test_deal('NONE', false, true, 1, 1, 4);
  foreach fn in array array[
    format('select public.admin_end_game_room(%L)', deal.room_id),
    format('select public.admin_remove_game_player(%L, %L)', deal.room_id, '22222222-2222-2222-2222-222222222222'),
    format('select public.admin_reset_game_name(%L, %L)', deal.room_id, '22222222-2222-2222-2222-222222222222')
  ] loop
    refused := false;
    execute 'set local role authenticated';
    perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
    begin execute fn; exception when insufficient_privilege then refused := true; end;
    if not refused then raise exception 'the room host could run %', fn; end if;
    refused := false;
    execute 'set local role anon';
    perform set_config('request.jwt.claim.sub', '', true);
    begin execute fn; exception when insufficient_privilege then refused := true; end;
    if not refused then raise exception 'anon could run %', fn; end if;
  end loop;
  execute 'set local role postgres';
  raise notice 'no API role can moderate';
end;
$$;

-- Reset a name, remove the host mid-round, then end the room -----------------
do $$
declare
  deal record;
  host constant uuid := '11111111-1111-1111-1111-111111111111';
  third constant uuid := '33333333-3333-3333-3333-333333333333';
  new_name text; stored text; new_host uuid; room_status text; live integer; refused boolean;
begin
  select * into deal from test_deal('NONE', false, true, 1, 1, 4);
  execute 'set local role postgres';

  -- Seats join in the order test_deal seats them, so the third is "Player 3".
  new_name := public.admin_reset_game_name(deal.room_id, third);
  select display_name into stored from public.game_room_players where room_id = deal.room_id and user_id = third;
  if new_name <> 'Player 3' or stored <> 'Player 3' then raise exception 'reset gave % / stored %', new_name, stored; end if;

  -- Removing the host is a departure: the host role passes on and the room goes on.
  perform public.admin_remove_game_player(deal.room_id, host);
  if exists (select 1 from public.game_room_players where room_id = deal.room_id and user_id = host) then raise exception 'host still seated'; end if;
  select host_id, status::text into new_host, room_status from public.game_rooms where id = deal.room_id;
  if new_host is null or new_host = host then raise exception 'host role did not pass on (%)', new_host; end if;
  if room_status = 'ENDED' then raise exception 'removing one player ended the room'; end if;

  refused := false;
  begin perform public.admin_remove_game_player(deal.room_id, host); exception when others then refused := sqlerrm like '%no longer in the room%'; end;
  if not refused then raise exception 'removing an absent player did not say so'; end if;

  -- Ending closes the live round through the existing trigger, once.
  if not public.admin_end_game_room(deal.room_id) then raise exception 'end reported nothing to do'; end if;
  select status::text into room_status from public.game_rooms where id = deal.room_id;
  select count(*) into live from public.game_rounds where room_id = deal.room_id and status not in ('REVEAL', 'ENDED');
  if room_status <> 'ENDED' or live <> 0 then raise exception 'room % with % live rounds after end', room_status, live; end if;
  if public.admin_end_game_room(deal.room_id) then raise exception 'an ended room ended twice'; end if;

  -- An ended room stays ended: no moderation brings it back or changes it.
  refused := false;
  begin perform public.admin_reset_game_name(deal.room_id, third); exception when others then refused := sqlerrm like '%has ended%'; end;
  if not refused then raise exception 'renamed a seat in an ended room'; end if;
  refused := false;
  begin perform public.admin_remove_game_player(deal.room_id, third); exception when others then refused := sqlerrm like '%has ended%'; end;
  if not refused then raise exception 'removed a player from an ended room'; end if;
  raise notice 'reset, host removal and end behave as a host''s own actions do';
end;
$$;

-- Removal racing the player's own Leave --------------------------------------
-- Committed data, because the two sides are separate connections.
insert into auth.users(id, email) values
  ('6d000000-0000-4000-8000-000000000001', 'moderation-host@example.com'),
  ('6d000000-0000-4000-8000-000000000002', 'moderation-target@example.com'),
  ('6d000000-0000-4000-8000-000000000003', 'moderation-third@example.com');
insert into public.legal_acceptances(user_id, version)
  select id, '2026-10-11.1' from public.profiles where email like 'moderation-%@example.com' on conflict do nothing;

create temp table moderation_race (room_id uuid);
do $$
declare invite text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '6d000000-0000-4000-8000-000000000001', true);
  invite := public.create_game_room();
  perform set_config('request.jwt.claim.sub', '6d000000-0000-4000-8000-000000000002', true);
  perform public.join_game_room(invite);
  perform set_config('request.jwt.claim.sub', '6d000000-0000-4000-8000-000000000003', true);
  perform public.join_game_room(invite);
  set local role postgres;
  insert into moderation_race select id from public.game_rooms where game_rooms.code = invite;
end;
$$;

-- The admin holds the room lock first; Leave waits, then finds nobody to remove.
do $$
declare room uuid; pid integer; queued boolean; seats integer;
begin
  select room_id into room from moderation_race;
  perform dblink_connect('moderator', format('dbname=%s user=postgres', current_database()));
  perform test_connect_as('leaver', '6d000000-0000-4000-8000-000000000002');
  perform dblink_exec('leaver', 'set statement_timeout = ''15s''');
  select v into pid from dblink('leaver', 'select pg_backend_pid()') as t(v integer);
  perform dblink_exec('moderator', 'begin');
  perform * from dblink('moderator', format('select public.admin_remove_game_player(%L, %L)', room, '6d000000-0000-4000-8000-000000000002')) as t(v text);
  perform dblink_send_query('leaver', format('select public.leave_game_room(%L)', room));
  queued := test_await_lock_waiter(pid);
  perform dblink_exec('moderator', 'commit');
  perform * from dblink_get_result('leaver') as t(v text);
  perform dblink_disconnect('moderator');
  perform dblink_disconnect('leaver');
  select count(*) into seats from public.game_room_players where room_id = room;
  if not queued then raise exception 'Leave did not wait for the removal'; end if;
  if seats <> 2 then raise exception 'expected 2 seats after one departure, found %', seats; end if;
  raise notice 'Leave waited for the removal, then had nothing left to do';
end;
$$;

-- The reverse: the player is leaving; the removal waits, then says they are gone.
do $$
declare room uuid; pid integer; queued boolean; refused boolean := false; seats integer;
begin
  select room_id into room from moderation_race;
  perform test_connect_as('leaver', '6d000000-0000-4000-8000-000000000003');
  perform dblink_connect('moderator', format('dbname=%s user=postgres', current_database()));
  perform dblink_exec('moderator', 'set statement_timeout = ''15s''');
  select v into pid from dblink('moderator', 'select pg_backend_pid()') as t(v integer);
  perform dblink_exec('leaver', 'begin');
  perform * from dblink('leaver', format('select public.leave_game_room(%L)', room)) as t(v text);
  perform dblink_send_query('moderator', format('select public.admin_remove_game_player(%L, %L)', room, '6d000000-0000-4000-8000-000000000003'));
  queued := test_await_lock_waiter(pid);
  perform dblink_exec('leaver', 'commit');
  begin
    perform * from dblink_get_result('moderator') as t(v text);
  exception when others then
    refused := sqlerrm like '%no longer in the room%';
  end;
  perform dblink_disconnect('leaver');
  perform dblink_disconnect('moderator');
  select count(*) into seats from public.game_room_players where room_id = room;
  if not queued then raise exception 'the removal did not wait for Leave'; end if;
  if not refused then raise exception 'the removal did not report the player had gone'; end if;
  if seats <> 1 then raise exception 'expected 1 seat, found %', seats; end if;
  raise notice 'the removal waited for Leave, then reported the player had already gone';
end;
$$;

-- Leave nothing live for later suites.
select public.admin_end_game_room(room_id) from moderation_race;

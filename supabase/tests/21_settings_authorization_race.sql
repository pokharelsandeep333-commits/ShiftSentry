\set ON_ERROR_STOP on

-- A waiter must be identified by backend, not by an unrelated database lock.
create or replace function test_await_lock_waiter(p_pid integer)
returns boolean language plpgsql as $$
begin
  for i in 1..100 loop
    if exists (select 1 from pg_locks where pid = p_pid and not granted) then
      return true;
    end if;
    perform pg_sleep(0.05);
  end loop;
  return false;
end;
$$;

-- Capacity decisions use the committed roster, serialized with joins.
create temp table capacity_race (code text, room_id uuid);
do $$
declare
  invite text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  invite := public.create_game_room();
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  perform public.join_game_room(invite);
  perform set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
  perform public.join_game_room(invite);
  set local role postgres;
  insert into capacity_race select invite, id from public.game_rooms where code = invite and status = 'LOBBY';
end;
$$;

do $$
declare
  invite text; room uuid; pid integer; queued boolean; refused boolean := false;
begin
  select code, room_id into invite, room from capacity_race;
  perform test_connect_as('capacity_join', '44444444-4444-4444-4444-444444444444');
  perform test_connect_as('capacity_write', '11111111-1111-1111-1111-111111111111');
  perform dblink_exec('capacity_write', 'set statement_timeout = ''15s''');
  select v into pid from dblink('capacity_write', 'select pg_backend_pid()') as t(v integer);
  perform dblink_exec('capacity_join', 'begin');
  perform * from dblink('capacity_join', format('select public.join_game_room(%L)', invite)) as t(v text);
  perform dblink_send_query('capacity_write', format(
    'select public.update_game_room_settings(%L, ''NONE'', false, true, 1, 1, 3, true, false, ''HARD'', null)', room));
  queued := test_await_lock_waiter(pid);
  perform dblink_exec('capacity_join', 'commit');
  begin
    perform * from dblink_get_result('capacity_write') as t(v text);
  exception when others then
    if sqlerrm !~ 'There are already 4 players' then raise; end if;
    refused := true;
  end;
  perform dblink_disconnect('capacity_join');
  perform dblink_disconnect('capacity_write');
  if not queued or not refused then raise exception 'Capacity did not wait and re-check the joined player'; end if;
  if (select max_players from public.game_rooms where id = room) <> 12 then raise exception 'Capacity changed below the roster'; end if;
  raise notice 'Capacity waited behind a join and rejected a cap below the committed roster';
end;
$$;

create temp table settings_race (room_id uuid);
do $$
declare invite text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  invite := public.create_game_room();
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  perform public.join_game_room(invite);
  set local role postgres;
  insert into settings_race select id from public.game_rooms where game_rooms.code = invite and status = 'LOBBY';
end;
$$;

do $$
declare
  room uuid; pid integer; queued boolean; refused boolean := false;
  current_host uuid; capacity integer;
begin
  select room_id into room from settings_race;
  perform test_connect_as('settings_leave', '11111111-1111-1111-1111-111111111111');
  perform test_connect_as('settings_write', '11111111-1111-1111-1111-111111111111');
  perform dblink_exec('settings_write', 'set statement_timeout = ''15s''');
  select v into pid from dblink('settings_write', 'select pg_backend_pid()') as t(v integer);
  perform dblink_exec('settings_leave', 'begin');
  perform * from dblink('settings_leave', format('select public.leave_game_room(%L)', room)) as t(v text);
  perform dblink_send_query('settings_write', format(
    'select public.update_game_room_settings(%L, ''NONE'', false, true, 1, 1, 8, true, false, ''HARD'', null)', room));
  queued := test_await_lock_waiter(pid);
  perform dblink_exec('settings_leave', 'commit');
  begin
    perform * from dblink_get_result('settings_write') as t(v text);
  exception when others then
    if sqlerrm !~ 'Only the host can change the settings' then raise; end if;
    refused := true;
  end;
  perform dblink_disconnect('settings_leave');
  perform dblink_disconnect('settings_write');
  select host_id, max_players into current_host, capacity from public.game_rooms where id = room;
  if not queued then raise exception 'Settings did not wait behind departure'; end if;
  if not refused or capacity <> 12 then raise exception 'Former host settings committed after succession: capacity %', capacity; end if;
  if current_host <> '22222222-2222-2222-2222-222222222222' then raise exception 'Host succession failed'; end if;

  -- The successor still owns the same settings API and can update normally.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', current_host::text, true);
  perform public.update_game_room_settings(room, 'NONE', false, true, 1, 1, 8, true, false, 'HARD', null);
  set local role postgres;
  if (select max_players from public.game_rooms where id = room) <> 8 then raise exception 'Successor settings were refused'; end if;
  raise notice 'Settings queued behind departure, rejected the former host, and accepted the successor';
end;
$$;

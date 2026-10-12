\set ON_ERROR_STOP on

insert into auth.users(id, email) values
  ('66666666-6666-4666-8666-666666666661', 'seat-race-join@example.com'),
  ('66666666-6666-4666-8666-666666666662', 'seat-race-host@example.com'),
  ('66666666-6666-4666-8666-666666666663', 'disable-race-join@example.com'),
  ('66666666-6666-4666-8666-666666666664', 'disable-race-host@example.com'),
  ('66666666-6666-4666-8666-666666666665', 'stale-seat@example.com');

insert into public.legal_acceptances(user_id, version)
  select id, '2026-10-11.1' from public.profiles where email like '%@example.com' on conflict do nothing;

create temp table disable_race (code text);
do $$
declare code text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  code := public.create_game_room();
  set local role postgres;
  insert into disable_race values(code);
end;
$$;

-- Both create and join hold eligibility until their seat is committed. The
-- disabling transaction then sees that seat and removes it before committing.
do $$
declare
  actor uuid; code text; pid integer; queued boolean; remaining integer;
begin
  select disable_race.code into code from disable_race;
  foreach actor in array array[
    '66666666-6666-4666-8666-666666666661'::uuid,
    '66666666-6666-4666-8666-666666666662'::uuid
  ] loop
    perform test_connect_as('seat', actor);
    perform dblink_connect('disable', format('dbname=%s user=postgres', current_database()));
    perform dblink_exec('disable', 'set statement_timeout = ''15s''');
    select v into pid from dblink('disable', 'select pg_backend_pid()') as t(v integer);
    perform dblink_exec('seat', 'begin');
    if actor::text like '%661' then
      perform * from dblink('seat', format('select public.join_game_room(%L)', code)) as t(v text);
    else
      perform * from dblink('seat', 'select public.create_game_room()') as t(v text);
    end if;
    perform dblink_send_query('disable', format('update public.profiles set disabled_at = now() where id = %L', actor));
    queued := test_await_lock_waiter(pid);
    perform dblink_exec('seat', 'commit');
    perform * from dblink_get_result('disable') as t(v text);
    perform dblink_disconnect('seat');
    perform dblink_disconnect('disable');
    select count(*) into remaining from public.game_room_players where user_id = actor;
    if not queued or remaining <> 0 then raise exception 'Disable raced past uncommitted seating: waited %, seats %', queued, remaining; end if;
  end loop;
  raise notice 'Disable waited for both create and join, then removed every newly committed seat';
end;
$$;

-- Reverse order: both seating RPCs wait, then reject the updated profile.
do $$
declare
  actor uuid;
  code text; pid integer; queued boolean; refused boolean := false;
begin
  select disable_race.code into code from disable_race;
  foreach actor in array array[
    '66666666-6666-4666-8666-666666666663'::uuid,
    '66666666-6666-4666-8666-666666666664'::uuid
  ] loop
  refused := false;
  perform dblink_connect('disable_first', format('dbname=%s user=postgres', current_database()));
  perform test_connect_as('join_second', actor);
  perform dblink_exec('join_second', 'set statement_timeout = ''15s''');
  select v into pid from dblink('join_second', 'select pg_backend_pid()') as t(v integer);
  perform dblink_exec('disable_first', 'begin');
  perform dblink_exec('disable_first', format('update public.profiles set disabled_at = now() where id = %L', actor));
  if actor::text like '%663' then
    perform dblink_send_query('join_second', format('select public.join_game_room(%L)', code));
  else
    perform dblink_send_query('join_second', 'select public.create_game_room()');
  end if;
  queued := test_await_lock_waiter(pid);
  perform dblink_exec('disable_first', 'commit');
  begin
    perform * from dblink_get_result('join_second') as t(v text);
  exception when others then
    if sqlerrm !~ 'This account has been disabled' then raise; end if;
    refused := true;
  end;
  perform dblink_disconnect('disable_first');
  perform dblink_disconnect('join_second');
  if not queued or not refused then raise exception 'Join did not wait and reject the disabled profile'; end if;
  if exists (select 1 from public.game_room_players where user_id = actor) then raise exception 'Disabled caller retained a seat'; end if;
  end loop;
  raise notice 'Create and join waited behind disablement and rejected it without a surviving seat';
end;
$$;

-- Simulate a legacy disabled seat without running cleanup. Neither room nor
-- round membership may confer access even if such unsafe state exists.
begin;
do $$
declare
  actor constant uuid := '66666666-6666-4666-8666-666666666665';
  invite text; room uuid; round uuid;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', actor::text, true);
  invite := public.create_game_room();
  set local role postgres;
  select id into room from public.game_rooms where code = invite and status = 'LOBBY';
  insert into public.game_rounds(room_id, round_no, word_id, decoy_mode, category_hint,
    imposter_final_guess, imposter_count, clue_passes)
    values(room, 1, (select min(id) from public.game_words), false, false, true, 1, 1)
    returning id into round;
  alter table public.profiles disable trigger profiles_disabled_leaves_games;
  perform set_config('request.jwt.claim.sub', '', true);
  update public.profiles set disabled_at = now() where id = actor;
  alter table public.profiles enable trigger profiles_disabled_leaves_games;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', actor::text, true);
  if public.is_game_room_member(room) or public.is_game_round_member(round) then
    raise exception 'A stale seat restored disabled-account membership';
  end if;
  if exists (select 1 from public.game_rooms where id = room) then
    raise exception 'A stale disabled seat restored RLS room access';
  end if;
  raise notice 'Legacy disabled seats confer no room or round membership or RLS room access';
end;
$$;
rollback;

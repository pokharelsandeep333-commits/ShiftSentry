\set ON_ERROR_STOP on

-- Two races, run for real on two connections.
--
-- Pins sections 2 and 3 of 20260926120000. One psql session cannot race itself,
-- so each case opens two dblink connections: the first takes the lock inside an
-- open transaction, the second sends the competing write asynchronously, and the
-- first commits only once the second is provably queued on the lock. Before the
-- fixes, the second compensation write never queued at all, and the queued join
-- took its seat anyway. The connection helpers live in harness/helpers.sql.

insert into public.jobs (id, user_id, name) values
  ('a0000000-0000-4000-8000-000000000001', '44444444-4444-4444-4444-444444444444', 'Race: two deductions'),
  ('a0000000-0000-4000-8000-000000000002', '44444444-4444-4444-4444-444444444444', 'Race: tax against a deduction');

-- Two 60% deductions added to one job at the same moment --------------------
do $$
declare
  dave constant uuid := '44444444-4444-4444-4444-444444444444';
  job constant uuid := 'a0000000-0000-4000-8000-000000000001';
  queued boolean; refused boolean := false; total integer;
begin
  perform test_connect_as('first', dave);
  perform test_connect_as('second', dave);

  perform dblink_exec('first', 'begin');
  perform dblink_exec('first', format(
    'insert into public.job_deductions (job_id, name, rate_basis_points) values (%L, %L, 6000)', job, 'First'));

  perform dblink_send_query('second', format(
    'insert into public.job_deductions (job_id, name, rate_basis_points) values (%L, %L, 6000)', job, 'Second'));
  queued := test_await_advisory_waiter();

  perform dblink_exec('first', 'commit');

  begin
    perform * from dblink_get_result('second') as t(status text);
  exception when others then
    if sqlerrm !~ 'cannot exceed 100' then raise; end if;
    refused := true;
  end;

  perform dblink_disconnect('first');
  perform dblink_disconnect('second');

  select coalesce(sum(rate_basis_points), 0) into total from public.job_deductions where job_id = job;

  if not queued then raise exception 'the second deduction did not wait for the first -- nothing serialises them'; end if;
  if not refused then raise exception 'both 60%% deductions committed: % basis points on one job', total; end if;
  if total <> 6000 then raise exception 'expected 6000 basis points on the job, found %', total; end if;
  raise notice 'two concurrent 60%% deductions: the second queued, then was refused';
end;
$$;

-- A tax raise racing a deduction on the same job ----------------------------
do $$
declare
  dave constant uuid := '44444444-4444-4444-4444-444444444444';
  job constant uuid := 'a0000000-0000-4000-8000-000000000002';
  queued boolean; refused boolean := false; tax integer; total integer;
begin
  perform test_connect_as('first', dave);
  perform test_connect_as('second', dave);

  perform dblink_exec('first', 'begin');
  perform dblink_exec('first', format(
    'insert into public.job_deductions (job_id, name, rate_basis_points) values (%L, %L, 6000)', job, 'Pension'));

  perform dblink_send_query('second', format(
    'update public.jobs set tax_rate_basis_points = 6000 where id = %L', job));
  queued := test_await_advisory_waiter();

  perform dblink_exec('first', 'commit');

  begin
    perform * from dblink_get_result('second') as t(status text);
  exception when others then
    if sqlerrm !~ 'cannot exceed 100' then raise; end if;
    refused := true;
  end;

  perform dblink_disconnect('first');
  perform dblink_disconnect('second');

  select tax_rate_basis_points into tax from public.jobs where id = job;
  select coalesce(sum(rate_basis_points), 0) into total from public.job_deductions where job_id = job;

  if not queued then raise exception 'the tax change did not wait for the deduction -- nothing serialises them'; end if;
  if not refused then raise exception 'tax % and deductions % both committed on one job', tax, total; end if;
  if tax + total > 10000 then raise exception 'job left at % basis points', tax + total; end if;
  raise notice 'a tax raise racing a deduction queued behind it, then was refused';
end;
$$;

-- A join that arrives while the host is dealing ----------------------------
do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob   constant uuid := '22222222-2222-2222-2222-222222222222';
  carol constant uuid := '33333333-3333-3333-3333-333333333333';
  dave  constant uuid := '44444444-4444-4444-4444-444444444444';
  room_code text; room uuid; queued boolean; joined boolean := false; seated integer;
begin
  -- The room is set up over the connection too, so it is committed before the
  -- race starts and visible to the second connection.
  perform test_connect_as('first', alice);
  select code into room_code from dblink('first', 'select public.create_game_room(''Alice'')') as t(code text);
  perform dblink_exec('first', format('set request.jwt.claim.sub = %L', bob));
  perform * from dblink('first', format('select public.join_game_room(%L)', room_code)) as t(code text);
  perform dblink_exec('first', format('set request.jwt.claim.sub = %L', carol));
  perform * from dblink('first', format('select public.join_game_room(%L)', room_code)) as t(code text);
  perform dblink_exec('first', format('set request.jwt.claim.sub = %L', alice));

  select id into room from public.game_rooms where code = room_code and status = 'LOBBY';

  -- Alice deals inside an open transaction: the room lock is held, and PLAYING
  -- is written but not yet committed.
  perform dblink_exec('first', 'begin');
  perform * from dblink('first', format('select public.start_game_round(%L)', room)) as t(round uuid);

  -- Dave opens the invite link at that moment. He reads the committed LOBBY.
  perform test_connect_as('second', dave);
  perform dblink_send_query('second', format('select public.join_game_room(%L)', room_code));
  queued := test_await_advisory_waiter();

  perform dblink_exec('first', 'commit');

  begin
    perform * from dblink_get_result('second') as t(code text);
    joined := true;
  exception when others then
    if sqlerrm !~ 'waiting for players' then raise; end if;
  end;

  perform dblink_disconnect('first');
  perform dblink_disconnect('second');

  select count(*) into seated from public.game_room_players where room_id = room and user_id = dave;

  if not queued then raise exception 'the join did not queue behind the deal, so this case proved nothing'; end if;
  if joined or seated <> 0 then raise exception 'a join queued behind the deal took a seat in a playing room'; end if;
  raise notice 'a join queued behind start_game_round was refused once the deal committed';
end;
$$;

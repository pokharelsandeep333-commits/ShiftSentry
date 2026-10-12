\set ON_ERROR_STOP on
-- Two independent sessions verify the deletion/write ordering in both directions.
insert into auth.users(id,email) values('6b000000-0000-4000-8000-000000000001','delete-race@example.com');
insert into public.legal_acceptances(user_id,version) values('6b000000-0000-4000-8000-000000000001','2026-10-11.1');
do $$
declare actor constant uuid := '6b000000-0000-4000-8000-000000000001'; pid integer; queued boolean; refused boolean := false;
begin
  perform test_connect_as('writer',actor);
  perform dblink_connect('deleter',format('dbname=%s user=postgres',current_database()));
  perform dblink_exec('deleter','set statement_timeout = ''15s''');
  select v into pid from dblink('deleter','select pg_backend_pid()') as t(v integer);
  perform dblink_exec('writer','begin');
  perform dblink_exec('writer',format('insert into public.jobs(user_id,name) values(%L,''Admitted before deletion'')',actor));
  perform dblink_send_query('deleter',format('select public.prepare_account_deletion(%L)',actor));
  queued := test_await_lock_waiter(pid);
  perform dblink_exec('writer','commit');
  perform * from dblink_get_result('deleter') as t(v text);
  if not queued then raise exception 'Deletion did not wait for an admitted write'; end if;
  perform dblink_disconnect('writer'); perform dblink_disconnect('deleter');

  -- Reverse ordering: an uncommitted deletion lock makes the writer wait;
  -- the writer must inspect the newly committed pending state and reject it.
  perform dblink_connect('deletion_first',format('dbname=%s user=postgres',current_database()));
  perform test_connect_as('write_second',actor);
  perform dblink_exec('write_second','set statement_timeout = ''15s''');
  select v into pid from dblink('write_second','select pg_backend_pid()') as t(v integer);
  perform dblink_exec('deletion_first','begin');
  perform * from dblink('deletion_first',format('select public.prepare_account_deletion(%L)',actor)) as t(v text);
  perform dblink_send_query('write_second',format('insert into public.jobs(user_id,name) values(%L,''Race after deletion'') returning id',actor));
  queued := test_await_lock_waiter(pid);
  perform dblink_exec('deletion_first','commit');
  begin perform * from dblink_get_result('write_second') as t(v uuid);
    exception when insufficient_privilege then refused := true;
  end;
  perform dblink_disconnect('deletion_first'); perform dblink_disconnect('write_second');
  if not queued or not refused then raise exception 'Write raced past uncommitted deletion'; end if;

  -- Retry is idempotent, and a late authenticated sync/work write cannot enter.
  perform public.prepare_account_deletion(actor);
  set local role authenticated;
  refused := false;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  begin insert into public.jobs(user_id,name) values(actor,'Late sync'); exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception 'Late write escaped deletion lock'; end if;
  set local role postgres;
  perform set_config('request.jwt.claim.sub','',true);
  raise notice 'Deletion waited for admitted writes; retries and later writes remain locked';
end;
$$;
delete from auth.users where id='6b000000-0000-4000-8000-000000000001';

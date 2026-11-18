\set ON_ERROR_STOP on

-- Clock-in timers: one per user, private to their owner, started at the
-- database's clock on one of the owner's active jobs, never edited, closed to
-- a disabled account or one without the current agreement, in the export, and
-- gone with the job or the profile. Stopping a timer is an ordinary shift
-- insert made by the app, so the shift rules are covered by their own suites;
-- the last block checks a timer does not get in the way of that insert.
-- Alice owns the fixtures; Bob must not see or touch them. Throwaway accounts
-- carry the disabled and no-agreement cases, so no shared fixture moves.

do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob constant uuid := '22222222-2222-2222-2222-222222222222';
  jade constant uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  kai constant uuid := 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  job uuid; archived_job uuid; jade_job uuid; kai_job uuid; bob_job uuid; scheduled uuid; finished uuid;
  stored timestamptz; seen integer; touched integer; refused boolean; exported jsonb;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', alice::text, true);
  insert into public.jobs (user_id, name, hourly_rate_cents) values (alice, 'Timer fixture', 1500) returning id into job;
  insert into public.jobs (user_id, name, hourly_rate_cents, archived_at) values (alice, 'Timer archived fixture', 1500, now()) returning id into archived_job;

  -- ---- starting stamps the database's clock, whatever the caller sends --------
  insert into public.shift_timers (user_id, job_id, started_at) values (alice, job, now() - interval '3 days');
  select started_at into stored from public.shift_timers where user_id = alice;
  if stored <> now() then raise exception 'a timer kept a client-supplied start of %', stored; end if;

  -- ---- one timer per user -----------------------------------------------------
  refused := false;
  begin
    insert into public.shift_timers (user_id, job_id) values (alice, job);
  exception when unique_violation then refused := true;
  end;
  if not refused then raise exception 'a second timer started while one was running'; end if;

  -- ---- a timer is never edited ------------------------------------------------
  refused := false;
  begin
    update public.shift_timers set started_at = now() - interval '5 hours' where user_id = alice;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'a running timer''s start was edited'; end if;

  -- ---- only an active job of your own -----------------------------------------
  delete from public.shift_timers where user_id = alice;
  refused := false;
  begin
    insert into public.shift_timers (user_id, job_id) values (alice, archived_job);
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'a timer started on an archived job'; end if;

  perform set_config('request.jwt.claim.sub', bob::text, true);
  refused := false;
  begin
    insert into public.shift_timers (user_id, job_id) values (bob, job);
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'Bob started a timer on Alice''s job'; end if;
  refused := false;
  begin
    insert into public.shift_timers (user_id, job_id) values (alice, job);
  -- The job check runs first and cannot see Alice's job through RLS; the
  -- insert policy would refuse it next. Either is a refusal.
  exception when insufficient_privilege or check_violation then refused := true;
  end;
  if not refused then raise exception 'Bob started a timer for Alice'; end if;

  -- ---- another user sees and stops nothing ------------------------------------
  perform set_config('request.jwt.claim.sub', alice::text, true);
  insert into public.shift_timers (user_id, job_id) values (alice, job);
  perform set_config('request.jwt.claim.sub', bob::text, true);
  select count(*) into seen from public.shift_timers;
  if seen <> 0 then raise exception 'Bob can see Alice''s timer'; end if;
  delete from public.shift_timers where user_id = alice;
  get diagnostics touched = row_count;
  if touched <> 0 then raise exception 'Bob stopped Alice''s timer'; end if;

  -- ---- the running timer is in the owner's export, and only hers --------------
  exported := public.export_account_data();
  if exported->'shiftTimer' <> 'null'::jsonb then raise exception 'Bob''s export carries a timer: %', exported->'shiftTimer'; end if;
  perform set_config('request.jwt.claim.sub', alice::text, true);
  exported := public.export_account_data();
  if exported->'shiftTimer'->>'job_id' is distinct from job::text or exported->'shiftTimer'->>'started_at' is null then
    raise exception 'the account export omits the running timer: %', exported->'shiftTimer';
  end if;

  -- ---- stopping: the timer does not block the shift insert that replaces it ---
  -- What stopShiftTimer does: insert the shift through the ordinary path, then
  -- delete the timer. The shift's own triggers still run.
  execute 'set local role postgres';
  update public.shift_timers set started_at = now() - interval '2 hours' where user_id = alice;
  execute 'set local role authenticated';
  insert into public.shifts (user_id, job_id, starts_at, ends_at)
    select alice, job_id, started_at, started_at + interval '2 hours' from public.shift_timers where user_id = alice;
  delete from public.shift_timers where user_id = alice;
  get diagnostics touched = row_count;
  if touched <> 1 then raise exception 'Alice could not stop her own timer'; end if;
  if (select net_cents from public.shifts where job_id = job) <> 3000 then raise exception 'the stopped shift did not take the pay snapshot'; end if;
  -- A stop that would break a shift rule is refused by the shift, not the timer.
  refused := false;
  begin
    insert into public.shifts (user_id, job_id, starts_at, ends_at) values (alice, job, now() - interval '25 hours', now());
  exception when raise_exception or check_violation then refused := true;
  end;
  if not refused then raise exception 'a 25-hour stopped timer was saved as a shift'; end if;
  delete from public.shifts where job_id = job;

  -- ---- clocking in during a logged shift adopts it ------------------------------
  insert into public.shifts (user_id, job_id, starts_at, ends_at) values (alice, job, now() - interval '30 minutes', now() + interval '3 hours') returning id into scheduled;
  insert into public.shift_timers (user_id, job_id, shift_id) values (alice, job, scheduled);
  if (select shift_id from public.shift_timers where user_id = alice) is distinct from scheduled then raise exception 'the timer did not keep the shift it adopted'; end if;
  exported := public.export_account_data();
  if exported->'shiftTimer'->>'shift_id' is distinct from scheduled::text then raise exception 'the export omits the adopted shift: %', exported->'shiftTimer'; end if;
  delete from public.shift_timers where user_id = alice;

  -- Only the caller's own shift, on the timer's job, and not already over.
  refused := false;
  begin
    insert into public.shift_timers (user_id, job_id, shift_id) values (alice, archived_job, scheduled);
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'a timer adopted a shift on another job'; end if;
  insert into public.shifts (user_id, job_id, starts_at, ends_at) values (alice, job, now() - interval '9 hours', now() - interval '5 hours') returning id into finished;
  refused := false;
  begin
    insert into public.shift_timers (user_id, job_id, shift_id) values (alice, job, finished);
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'a timer adopted a shift that had already ended'; end if;
  perform set_config('request.jwt.claim.sub', bob::text, true);
  insert into public.jobs (user_id, name) values (bob, 'Bob timer fixture') returning id into bob_job;
  refused := false;
  begin
    insert into public.shift_timers (user_id, job_id, shift_id) values (bob, bob_job, scheduled);
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'Bob adopted Alice''s shift'; end if;
  delete from public.jobs where id = bob_job;

  -- Stopping updates the adopted shift's times through the ordinary update:
  -- a raise since it was logged does not reprice it, as for any edit that
  -- keeps the job, and the shift rules still apply.
  perform set_config('request.jwt.claim.sub', alice::text, true);
  insert into public.shift_timers (user_id, job_id, shift_id) values (alice, job, scheduled);
  update public.jobs set hourly_rate_cents = 9900 where id = job;
  update public.shifts set starts_at = now() - interval '1 hour', ends_at = now() where id = scheduled;
  delete from public.shift_timers where user_id = alice;
  if (select hourly_rate_cents from public.shifts where id = scheduled) <> 1500 then raise exception 'stopping an adopted shift repriced it'; end if;
  if (select net_cents from public.shifts where id = scheduled) <> 1500 then raise exception 'the adopted shift''s pay did not follow its real times'; end if;
  refused := false;
  begin
    update public.shifts set starts_at = now() - interval '25 hours', ends_at = now() where id = scheduled;
  exception when raise_exception or check_violation then refused := true;
  end;
  if not refused then raise exception 'an adopted shift was stretched past 24 hours'; end if;

  -- Deleting the adopted shift leaves the clock running, now on a new shift.
  -- (The stop above ended it at now, and an ended shift cannot be adopted.)
  update public.shifts set ends_at = now() + interval '1 hour' where id = scheduled;
  insert into public.shift_timers (user_id, job_id, shift_id) values (alice, job, scheduled);
  delete from public.shifts where id = scheduled;
  select count(*) into seen from public.shift_timers where user_id = alice and shift_id is null;
  if seen <> 1 then raise exception 'deleting the adopted shift took the timer with it, or left it pointing at nothing'; end if;
  delete from public.shift_timers where user_id = alice;
  delete from public.shifts where job_id = job;
  update public.jobs set hourly_rate_cents = 1500 where id = job;

  -- ---- a disabled account is locked out ---------------------------------------
  execute 'set local role postgres';
  perform set_config('request.jwt.claim.sub', '', true);
  insert into auth.users (id, email) values (jade, 'jade.timer@example.com');
  insert into public.legal_acceptances (user_id, version) values (jade, '2026-11-02.1');
  insert into public.jobs (user_id, name) values (jade, 'Jade job') returning id into jade_job;
  insert into public.shift_timers (user_id, job_id) values (jade, jade_job);
  update public.profiles set disabled_at = now() where id = jade;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', jade::text, true);
  select count(*) into seen from public.shift_timers;
  if seen <> 0 then raise exception 'a disabled account can still read its timer'; end if;
  delete from public.shift_timers where user_id = jade;
  get diagnostics touched = row_count;
  if touched <> 0 then raise exception 'a disabled account can still stop its timer'; end if;
  execute 'set local role postgres';
  perform set_config('request.jwt.claim.sub', '', true);
  delete from public.shift_timers where user_id = jade;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', jade::text, true);
  refused := false;
  begin
    insert into public.shift_timers (user_id, job_id) values (jade, jade_job);
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'a disabled account can still start a timer'; end if;

  -- ---- no current agreement, no timer -----------------------------------------
  execute 'set local role postgres';
  perform set_config('request.jwt.claim.sub', '', true);
  insert into auth.users (id, email) values (kai, 'kai.timer@example.com');
  insert into public.jobs (user_id, name) values (kai, 'Kai job') returning id into kai_job;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', kai::text, true);
  refused := false;
  begin
    insert into public.shift_timers (user_id, job_id) values (kai, kai_job);
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'an account without the current agreement started a timer'; end if;

  -- ---- the timer goes with its job, and with the profile ----------------------
  execute 'set local role postgres';
  perform set_config('request.jwt.claim.sub', '', true);
  insert into public.shift_timers (user_id, job_id) values (alice, job);
  delete from public.jobs where id = job;
  select count(*) into seen from public.shift_timers where user_id = alice;
  if seen <> 0 then raise exception 'deleting a job left its timer behind'; end if;
  delete from public.jobs where id = archived_job;

  insert into public.shift_timers (user_id, job_id) values (kai, kai_job);
  delete from public.profiles where id = kai;
  select count(*) into seen from public.shift_timers where user_id = kai;
  if seen <> 0 then raise exception 'deleting a profile left its timer behind'; end if;
  delete from auth.users where id = kai;
  delete from public.profiles where id = jade;
  delete from auth.users where id = jade;

  -- ---- anon has no access at all ----------------------------------------------
  execute 'set local role anon';
  refused := false;
  begin
    perform 1 from public.shift_timers;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'anon can select from shift_timers'; end if;

  execute 'set local role postgres';
  raise notice 'timers: database clock, one per user, owner-only, active jobs only, adopt only an own unfinished shift on the same job, never edited, locked when disabled or unagreed, exported, cascaded';
end;
$$;

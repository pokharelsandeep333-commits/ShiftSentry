\set ON_ERROR_STOP on

-- A job's pay schedule is one of three coherent shapes, and its columns ride
-- along with the job's existing owner-only access and the account export.
-- Alice owns the job; Bob must not change it. The job is removed at the end so
-- no later suite inherits it.

do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob constant uuid := '22222222-2222-2222-2222-222222222222';
  job uuid;
  touched integer; refused boolean; exported jsonb;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', alice::text, true);

  -- ---- a new job has no schedule ----------------------------------------------
  insert into public.jobs (user_id, name, hourly_rate_cents) values (alice, 'Pay schedule fixture', 1500) returning id into job;
  if (select pay_schedule from public.jobs where id = job) <> 'none' then raise exception 'a new job did not default to no pay schedule'; end if;

  -- ---- the two real shapes save -----------------------------------------------
  update public.jobs set pay_schedule = 'every_n_weeks', pay_interval_weeks = 2, pay_anchor_date = '2026-10-15', payday_offset_days = 6 where id = job;
  get diagnostics touched = row_count;
  if touched <> 1 then raise exception 'Alice could not set a biweekly schedule'; end if;
  update public.jobs set pay_schedule = 'monthly_day', pay_interval_weeks = null, pay_anchor_date = null, pay_month_day = 21, payday_offset_days = null where id = job;
  get diagnostics touched = row_count;
  if touched <> 1 then raise exception 'Alice could not set a monthly schedule'; end if;

  -- ---- incoherent shapes are refused ------------------------------------------
  refused := false;
  begin
    update public.jobs set pay_schedule = 'every_n_weeks', pay_month_day = null where id = job;
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'every_n_weeks was saved without an interval or anchor'; end if;

  refused := false;
  begin
    update public.jobs set pay_interval_weeks = 2 where id = job;
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'a monthly schedule was saved with a weekly interval too'; end if;

  refused := false;
  begin
    update public.jobs set pay_schedule = 'none', pay_month_day = null, payday_offset_days = 5 where id = job;
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'a payday offset was saved on a job with no schedule'; end if;

  refused := false;
  begin
    update public.jobs set pay_schedule = 'fortnightly' where id = job;
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'an unknown schedule kind was accepted'; end if;

  -- ---- ranges ------------------------------------------------------------------
  refused := false;
  begin
    update public.jobs set pay_month_day = 32 where id = job;
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'day 32 of the month was accepted'; end if;

  refused := false;
  begin
    update public.jobs set pay_schedule = 'every_n_weeks', pay_month_day = null, pay_interval_weeks = 5, pay_anchor_date = '2026-10-15' where id = job;
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'a five-week interval was accepted'; end if;

  refused := false;
  begin
    update public.jobs set payday_offset_days = 32 where id = job;
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'a 32-day payday offset was accepted'; end if;

  -- ---- the schedule is in the export ------------------------------------------
  exported := public.export_account_data();
  if not exists (
    select 1 from jsonb_array_elements(exported->'jobs') entry
    where entry->>'id' = job::text and entry->>'pay_schedule' = 'monthly_day' and (entry->>'pay_month_day')::int = 21
  ) then raise exception 'the account export omits the pay schedule'; end if;

  -- ---- another user cannot change it ------------------------------------------
  perform set_config('request.jwt.claim.sub', bob::text, true);
  update public.jobs set pay_month_day = 1 where id = job;
  get diagnostics touched = row_count;
  if touched <> 0 then raise exception 'Bob changed Alice''s pay schedule'; end if;

  -- ---- clearing it -------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', alice::text, true);
  update public.jobs set pay_schedule = 'none', pay_month_day = null where id = job;
  get diagnostics touched = row_count;
  if touched <> 1 then raise exception 'Alice could not clear her pay schedule'; end if;

  delete from public.jobs where id = job;
end;
$$;

reset role;

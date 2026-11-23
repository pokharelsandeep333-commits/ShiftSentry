\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
  ('6c000000-0000-4000-8000-000000000001','break-owner@example.com'),
  ('6c000000-0000-4000-8000-000000000002','break-other@example.com');

update public.profiles set time_zone = 'America/Chicago', week_starts_on = 1, global_weekly_limit_minutes = 1200
  where id = '6c000000-0000-4000-8000-000000000001';

do $$
declare
  owner_id constant uuid := '6c000000-0000-4000-8000-000000000001';
  other_id constant uuid := '6c000000-0000-4000-8000-000000000002';
  winter_id uuid;
  desk_id uuid;
  shop_id uuid;
  touched integer;
  exported jsonb;
begin
  set local role anon;
  if has_table_privilege('public.break_periods', 'select') then raise exception 'anon can read break periods'; end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  begin
    insert into public.break_periods (user_id, start_date, end_date, weekly_limit_minutes)
      values (owner_id, '2026-12-16', '2027-01-04', 2400);
    raise exception 'break period write bypassed the agreement';
  exception when insufficient_privilege then null;
  end;

  perform public.accept_legal_terms('2026-11-23.1', true, true);
  insert into public.jobs (user_id, name) values (owner_id, 'Desk') returning id into desk_id;
  insert into public.jobs (user_id, name, weekly_limit_minutes) values (owner_id, 'Shop', 120) returning id into shop_id;
  insert into public.break_periods (user_id, start_date, end_date, weekly_limit_minutes, label)
    values (owner_id, '2026-12-16', '2027-01-04', 2400, 'Winter break') returning id into winter_id;

  begin
    insert into public.break_periods (user_id, start_date, end_date, weekly_limit_minutes)
      values (owner_id, '2027-01-04', '2027-01-06', 3000);
    raise exception 'two breaks shared an inclusive date';
  exception when exclusion_violation then null;
  end;
  insert into public.break_periods (user_id, start_date, end_date, weekly_limit_minutes)
    values (owner_id, '2027-01-05', '2027-01-05', 3000);
  begin
    update public.break_periods set end_date = '2027-01-05' where id = winter_id;
    raise exception 'an edit overlapped an adjacent period';
  exception when exclusion_violation then null;
  end;
  delete from public.break_periods where start_date = '2027-01-05';
  get diagnostics touched = row_count;
  if touched <> 1 then raise exception 'owner could not delete an adjacent period'; end if;

  -- The first straddling week starts Dec 14 outside the period, even for shifts during the break.
  begin
    insert into public.shifts (user_id, job_id, starts_at, ends_at)
      values (owner_id, desk_id, '2026-12-17 06:00+00', '2026-12-18 04:00+00');
    raise exception 'a week that started outside the break used the break cap';
  exception when raise_exception then
    if sqlerrm <> 'This shift exceeds your global weekly limit.' then raise; end if;
  end;

  -- A full break week admits 40 hours exactly and rejects the next minute.
  insert into public.shifts (user_id, job_id, starts_at, ends_at) values
    (owner_id, desk_id, '2026-12-22 06:00+00', '2026-12-23 04:00+00'),
    (owner_id, desk_id, '2026-12-24 06:00+00', '2026-12-25 00:00+00');
  begin
    insert into public.shifts (user_id, job_id, starts_at, ends_at)
      values (owner_id, desk_id, '2026-12-25 00:00+00', '2026-12-25 00:01+00');
    raise exception 'the break cap accepted a minute over 40 hours';
  exception when raise_exception then
    if sqlerrm <> 'This shift exceeds your global weekly limit.' then raise; end if;
  end;

  -- The last straddling week starts Jan 4, the last inclusive day. Jan 7 still uses the break cap.
  insert into public.shifts (user_id, job_id, starts_at, ends_at)
    values (owner_id, desk_id, '2027-01-07 06:00+00', '2027-01-08 04:00+00');
  begin
    insert into public.shifts (user_id, job_id, starts_at, ends_at)
      values (owner_id, shop_id, '2027-01-09 06:00+00', '2027-01-09 08:01+00');
    raise exception 'the break cap bypassed the per-job cap';
  exception when raise_exception then
    if sqlerrm <> 'This shift exceeds the job weekly limit.' then raise; end if;
  end;
  begin
    insert into public.shifts (user_id, job_id, starts_at, ends_at)
      values (owner_id, desk_id, '2027-01-14 06:00+00', '2027-01-15 04:00+00');
    raise exception 'a week after the break used its cap';
  exception when raise_exception then
    if sqlerrm <> 'This shift exceeds your global weekly limit.' then raise; end if;
  end;

  -- The two sides of a shift over local Monday midnight can have different caps.
  set local role postgres;
  perform set_config('request.jwt.claim.sub', '', true);
  update public.profiles set global_weekly_limit_minutes = null where id = owner_id;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  insert into public.break_periods (user_id, start_date, end_date, weekly_limit_minutes)
    values (owner_id, '2027-01-11', '2027-01-11', 45);
  begin
    insert into public.shifts (user_id, job_id, starts_at, ends_at)
      values (owner_id, desk_id, '2027-01-11 05:00+00', '2027-01-11 07:00+00');
    raise exception 'the second local week of an overnight shift escaped its cap';
  exception when raise_exception then
    if sqlerrm <> 'This shift exceeds your global weekly limit.' then raise; end if;
  end;
  update public.break_periods set label = 'Winter session' where id = winter_id;
  get diagnostics touched = row_count;
  if touched <> 1 then raise exception 'owner could not edit a period'; end if;

  -- Havana skipped midnight on March 8. PostgreSQL's Sunday boundary was
  -- 05:00 UTC, so only the last 30 minutes count against the 45-minute cap.
  set local role postgres;
  perform set_config('request.jwt.claim.sub', '', true);
  update public.profiles set time_zone = 'America/Havana', week_starts_on = 0 where id = owner_id;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  insert into public.break_periods (user_id, start_date, end_date, weekly_limit_minutes)
    values (owner_id, '2026-03-08', '2026-03-08', 45);
  insert into public.shifts (user_id, job_id, starts_at, ends_at)
    values (owner_id, desk_id, '2026-03-08 04:30+00', '2026-03-08 05:30+00');

  perform set_config('request.jwt.claim.sub', other_id::text, true);
  perform public.accept_legal_terms('2026-11-23.1', true, true);
  if exists(select 1 from public.break_periods where id = winter_id) then raise exception 'another user read a private break'; end if;
  update public.break_periods set label = 'changed' where id = winter_id;
  get diagnostics touched = row_count;
  if touched <> 0 then raise exception 'another user edited a private break'; end if;
  delete from public.break_periods where id = winter_id;
  get diagnostics touched = row_count;
  if touched <> 0 then raise exception 'another user deleted a private break'; end if;
  begin
    insert into public.break_periods (user_id, start_date, end_date, weekly_limit_minutes)
      values (owner_id, '2027-02-01', '2027-02-01', 2400);
    raise exception 'another user added a break for the owner';
  exception when insufficient_privilege then null;
  end;
  insert into public.break_periods (user_id, start_date, end_date, weekly_limit_minutes, label)
    values (other_id, '2026-12-16', '2027-01-04', 600, 'Private break');
  exported := public.export_account_data()->'breakPeriods';
  if jsonb_array_length(exported) is distinct from 1 or exported->0->>'label' is distinct from 'Private break'
    then raise exception 'the other account export did not isolate its own break'; end if;

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  exported := public.export_account_data()->'breakPeriods';
  if jsonb_array_length(exported) is distinct from 3 or not exported @> jsonb_build_array(
    jsonb_build_object('id', winter_id, 'label', 'Winter session', 'start_date', '2026-12-16',
      'end_date', '2027-01-04', 'weekly_limit_minutes', 2400)
  ) then raise exception 'owner export omitted or changed a break period'; end if;

  set local role postgres;
  perform set_config('request.jwt.claim.sub', '', true);
  update public.profiles set disabled_at = now() where id = owner_id;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  if exists(select 1 from public.break_periods) then raise exception 'a disabled account can still read breaks'; end if;
  if jsonb_array_length(public.export_account_data()->'breakPeriods') is distinct from 3
    then raise exception 'a disabled account lost export access'; end if;

  set local role postgres;
  perform set_config('request.jwt.claim.sub', '', true);
  delete from auth.users where id = owner_id;
  if exists(select 1 from public.break_periods where user_id = owner_id)
    then raise exception 'account deletion left break periods behind'; end if;
end;
$$;

rollback;

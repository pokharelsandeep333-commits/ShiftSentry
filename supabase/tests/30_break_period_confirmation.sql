\set ON_ERROR_STOP on
begin;

-- The hosted authenticated role can call auth.uid() inside invoker functions.
grant usage on schema auth to authenticated;
insert into auth.users(id,email) values
  ('fc171111-0000-4000-8000-000000000001','confirm-owner@example.com'),
  ('fc171111-0000-4000-8000-000000000002','confirm-other@example.com');
update public.profiles set time_zone = 'America/Chicago', week_starts_on = 1, global_weekly_limit_minutes = 1200
  where id = 'fc171111-0000-4000-8000-000000000001';

do $$
declare
  owner_id constant uuid := 'fc171111-0000-4000-8000-000000000001';
  other_id constant uuid := 'fc171111-0000-4000-8000-000000000002';
  period_id uuid;
  job_id uuid;
  archived_job_id uuid;
  token text;
  refreshed_token text;
  affected jsonb;
begin
  if has_function_privilege('anon', 'public.change_break_period(uuid,date,date,integer,text,text)', 'execute')
    then raise exception 'anonymous callers can invoke break confirmation'; end if;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  perform public.accept_legal_terms('2026-11-17.1', true, true);
  insert into public.jobs (user_id, name) values (owner_id, 'Desk') returning id into job_id;
  insert into public.jobs (user_id, name, archived_at) values (owner_id, 'Archive', now()) returning id into archived_job_id;
  insert into public.break_periods (user_id, start_date, end_date, weekly_limit_minutes)
    values (owner_id, '2026-11-16', '2026-12-01', 2400) returning id into period_id;
  insert into public.shifts (user_id, job_id, starts_at, ends_at) values
    (owner_id, archived_job_id, '2026-11-17 06:00+00', '2026-11-18 03:00:31+00'),
    (owner_id, job_id, '2026-11-24 06:00+00', '2026-11-25 01:30+00'),
    (owner_id, job_id, '2026-11-30 05:30+00', '2026-11-30 06:30+00'),
    (owner_id, job_id, '2026-12-01 06:00+00', '2026-12-02 02:00+00');

  select confirmation, weeks into token, affected
    from public.change_break_period(period_id, '2026-11-16', '2026-12-01', 1200);
  if token is null or affected is distinct from '[
    {"week_start":"2026-11-16","scheduled_minutes":1261,"cap_minutes":1200},
    {"week_start":"2026-11-30","scheduled_minutes":1230,"cap_minutes":1200}
  ]'::jsonb then raise exception 'cap decrease omitted a week, ignored an archived shift or rounded incorrectly: %', affected; end if;
  if (select weekly_limit_minutes from public.break_periods where id = period_id) is distinct from 2400
    then raise exception 'a cap decrease was applied without confirmation'; end if;

  select confirmation, weeks into refreshed_token, affected
    from public.change_break_period(period_id, '2026-11-16', '2026-11-22', 2400, p_confirmation => token);
  if refreshed_token is null or refreshed_token = token or affected is distinct from '[
    {"week_start":"2026-11-30","scheduled_minutes":1230,"cap_minutes":1200}
  ]'::jsonb then raise exception 'a changed draft did not recalculate impact: %', affected; end if;
  token := refreshed_token;

  insert into public.shifts (user_id, job_id, starts_at, ends_at)
    values (owner_id, job_id, '2026-12-03 06:00+00', '2026-12-03 07:00+00');
  select confirmation, weeks into refreshed_token, affected
    from public.change_break_period(period_id, '2026-11-16', '2026-11-22', 2400, p_confirmation => token);
  if refreshed_token is null or refreshed_token = token or affected->0->>'scheduled_minutes' is distinct from '1290'
    then raise exception 'a stale confirmation did not show the updated schedule: %', affected; end if;
  if (select end_date from public.break_periods where id = period_id) is distinct from date '2026-12-01'
    then raise exception 'a stale confirmation applied the edit'; end if;

  select confirmation into token
    from public.change_break_period(period_id, '2026-11-16', '2026-11-22', 2400, p_confirmation => refreshed_token);
  if token is not null or (select end_date from public.break_periods where id = period_id) is distinct from date '2026-11-22'
    then raise exception 'a matching confirmation did not apply the edit'; end if;
  select confirmation into token from public.change_break_period(period_id, '2026-11-16', '2026-11-22', 2400, 'Renamed');
  if token is not null or (select label from public.break_periods where id = period_id) is distinct from 'Renamed'
    then raise exception 'a label-only edit required confirmation'; end if;

  perform set_config('request.jwt.claim.sub', other_id::text, true);
  perform public.accept_legal_terms('2026-11-17.1', true, true);
  begin
    perform public.change_break_period(period_id);
    raise exception 'another user accessed a private break';
  exception when no_data_found then null;
  end;

  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  select confirmation, weeks into token, affected from public.change_break_period(period_id);
  if token is null or affected is distinct from '[
    {"week_start":"2026-11-16","scheduled_minutes":1261,"cap_minutes":1200}
  ]'::jsonb then raise exception 'delete did not report the restored default cap: %', affected; end if;
  if not exists(select 1 from public.break_periods where id = period_id)
    then raise exception 'break was deleted without confirmation'; end if;
  select confirmation into refreshed_token from public.change_break_period(period_id, p_confirmation => token);
  if refreshed_token is not null or exists(select 1 from public.break_periods where id = period_id)
    then raise exception 'a matching confirmation did not delete the break'; end if;
  if (select count(*) from public.shifts where user_id = owner_id) <> 5
    then raise exception 'break changes modified the existing shifts'; end if;

  set local role postgres;
  perform set_config('request.jwt.claim.sub', '', true);
  update public.profiles set global_weekly_limit_minutes = null where id = owner_id;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  insert into public.break_periods (user_id, start_date, end_date, weekly_limit_minutes)
    values (owner_id, '2026-11-16', '2026-11-22', 2400) returning id into period_id;
  select confirmation into token from public.change_break_period(period_id);
  if token is not null or exists(select 1 from public.break_periods where id = period_id)
    then raise exception 'removing a cap with no default required confirmation'; end if;
end;
$$;

rollback;

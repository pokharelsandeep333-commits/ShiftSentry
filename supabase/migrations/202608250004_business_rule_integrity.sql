-- Enforce ShiftSentry's compensation and weekly-limit rules for every write,
-- including authenticated PostgREST requests that bypass Server Actions.

create or replace function public.enforce_job_compensation_rate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  job_tax_rate integer;
  deduction_rate integer;
begin
  if tg_table_name = 'jobs' then
    select coalesce(sum(rate_basis_points), 0)
      into deduction_rate
      from public.job_deductions
      where job_id = new.id;

    if new.tax_rate_basis_points + deduction_rate > 10000 then
      raise exception 'Tax and deductions together cannot exceed 100%%.';
    end if;
  else
    select tax_rate_basis_points
      into job_tax_rate
      from public.jobs
      where id = new.job_id;

    if job_tax_rate is null then
      raise exception 'Job not found.';
    end if;

    select coalesce(sum(rate_basis_points), 0)
      into deduction_rate
      from public.job_deductions
      where job_id = new.job_id
        and id is distinct from new.id;

    if job_tax_rate + deduction_rate + new.rate_basis_points > 10000 then
      raise exception 'Tax and deductions together cannot exceed 100%%.';
    end if;
  end if;

  return new;
end;
$$;

create trigger jobs_enforce_compensation_rate
before insert or update of tax_rate_basis_points on public.jobs
for each row execute procedure public.enforce_job_compensation_rate();

create trigger job_deductions_enforce_compensation_rate
before insert or update of job_id, rate_basis_points on public.job_deductions
for each row execute procedure public.enforce_job_compensation_rate();

create or replace function public.sync_shift_earnings_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  shift_minutes integer;
  hourly_rate integer;
  tax_rate integer;
  gross integer;
begin
  select
    jobs.hourly_rate_cents,
    jobs.tax_rate_basis_points,
    coalesce(
      jsonb_agg(
        jsonb_build_object('name', job_deductions.name, 'rateBasisPoints', job_deductions.rate_basis_points)
        order by job_deductions.id
      ) filter (where job_deductions.id is not null),
      '[]'::jsonb
    )
  into hourly_rate, tax_rate, new.deductions_snapshot
  from public.jobs
  left join public.job_deductions on job_deductions.job_id = jobs.id
  where jobs.id = new.job_id
  group by jobs.id;

  if hourly_rate is null or tax_rate is null then
    raise exception 'Job not found.';
  end if;

  shift_minutes := floor(extract(epoch from new.ends_at - new.starts_at) / 60)::integer;
  gross := round((shift_minutes::numeric * hourly_rate) / 60)::integer;

  new.hourly_rate_cents := hourly_rate;
  new.tax_rate_basis_points := tax_rate;
  new.gross_cents := gross;
  new.tax_cents := round((gross::numeric * tax_rate) / 10000)::integer;
  new.deduction_cents := coalesce((
    select sum(round((gross::numeric * job_deductions.rate_basis_points) / 10000)::integer)
    from public.job_deductions
    where job_deductions.job_id = new.job_id
  ), 0);
  new.net_cents := greatest(0, new.gross_cents - new.tax_cents - new.deduction_cents);

  return new;
end;
$$;

create trigger shifts_sync_earnings_snapshot
before insert or update on public.shifts
for each row execute procedure public.sync_shift_earnings_snapshot();

create or replace function public.enforce_shift_weekly_limits()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  user_time_zone text;
  user_week_starts_on integer;
  global_limit integer;
  job_limit integer;
  week_start_date date;
  week_start_at timestamptz;
  week_end_at timestamptz;
  candidate_minutes integer;
  existing_global_minutes integer;
  existing_job_minutes integer;
begin
  if new.ends_at <= new.starts_at or new.ends_at - new.starts_at > interval '24 hours' then
    raise exception 'A shift must be longer than zero and no more than 24 hours.';
  end if;

  select time_zone, week_starts_on, global_weekly_limit_minutes
    into user_time_zone, user_week_starts_on, global_limit
    from public.profiles
    where id = new.user_id;

  if user_time_zone is null then
    raise exception 'User profile not found.';
  end if;

  select weekly_limit_minutes
    into job_limit
    from public.jobs
    where id = new.job_id
      and user_id = new.user_id;

  if not found then
    raise exception 'A shift must belong to one of your jobs.';
  end if;

  -- Serialize competing writes for this user so two individually valid shifts
  -- cannot race past a weekly cap.
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));

  week_start_date := (new.starts_at at time zone user_time_zone)::date
    - ((extract(dow from (new.starts_at at time zone user_time_zone))::integer - user_week_starts_on + 7) % 7);

  while (week_start_date::timestamp at time zone user_time_zone) < new.ends_at loop
    week_start_at := week_start_date::timestamp at time zone user_time_zone;
    week_end_at := (week_start_date + 7)::timestamp at time zone user_time_zone;
    candidate_minutes := round(extract(epoch from least(new.ends_at, week_end_at) - greatest(new.starts_at, week_start_at)) / 60)::integer;

    if candidate_minutes > 0 then
      select coalesce(sum(round(extract(epoch from least(shifts.ends_at, week_end_at) - greatest(shifts.starts_at, week_start_at)) / 60)::integer), 0)
        into existing_global_minutes
        from public.shifts
        where user_id = new.user_id
          and id is distinct from new.id
          and starts_at < week_end_at
          and ends_at > week_start_at;

      if global_limit is not null and existing_global_minutes + candidate_minutes > global_limit then
        raise exception 'This shift exceeds your global weekly limit.';
      end if;

      select coalesce(sum(round(extract(epoch from least(shifts.ends_at, week_end_at) - greatest(shifts.starts_at, week_start_at)) / 60)::integer), 0)
        into existing_job_minutes
        from public.shifts
        where user_id = new.user_id
          and job_id = new.job_id
          and id is distinct from new.id
          and starts_at < week_end_at
          and ends_at > week_start_at;

      if job_limit is not null and existing_job_minutes + candidate_minutes > job_limit then
        raise exception 'This shift exceeds the job weekly limit.';
      end if;
    end if;

    week_start_date := week_start_date + 7;
  end loop;

  return new;
end;
$$;

create trigger shifts_enforce_weekly_limits
before insert or update of user_id, job_id, starts_at, ends_at on public.shifts
for each row execute procedure public.enforce_shift_weekly_limits();

-- These are trigger-only helpers, not public RPCs.
revoke execute on function public.enforce_job_compensation_rate() from public, anon, authenticated;
revoke execute on function public.sync_shift_earnings_snapshot() from public, anon, authenticated;
revoke execute on function public.enforce_shift_weekly_limits() from public, anon, authenticated;

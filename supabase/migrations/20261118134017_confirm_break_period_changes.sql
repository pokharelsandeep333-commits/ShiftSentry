-- Settings previews and applies the edit or deletion in the same transaction
-- as the last impact check. Reuse the shift trigger's per-user lock so a
-- shift cannot be added or rescheduled between the check and the write.
create function public.change_break_period(
  p_id uuid,
  p_start_date date default null,
  p_end_date date default null,
  p_weekly_limit_minutes integer default null,
  p_label text default null,
  p_confirmation text default null
)
returns table(confirmation text, weeks jsonb)
language plpgsql security invoker set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  time_zone_name text;
  first_day integer;
  default_cap integer;
  period public.break_periods%rowtype;
  affected jsonb := '[]'::jsonb;
  current_confirmation text;
begin
  if actor is null
    or not public.is_account_enabled()
    or not public.has_current_legal_acceptance() then
    raise exception 'The workspace is unavailable.' using errcode = '42501';
  end if;

  select p.time_zone, p.week_starts_on, p.global_weekly_limit_minutes
    into strict time_zone_name, first_day, default_cap
    from public.profiles p where p.id = actor for share;
  perform pg_advisory_xact_lock(hashtext(actor::text));
  select b.* into strict period from public.break_periods b
    where b.id = p_id and b.user_id = actor for update;

  if p_start_date is null then
    if p_end_date is not null or p_weekly_limit_minutes is not null or p_label is not null then
      raise exception 'Invalid break period change.' using errcode = '22023';
    end if;
  else
    if p_end_date is null or p_weekly_limit_minutes is null
      or p_start_date < date '0001-01-01' or p_end_date > date '9999-12-31'
      or p_start_date > p_end_date or p_weekly_limit_minutes not between 1 and 10080
      or (p_label is not null and char_length(btrim(p_label)) not between 1 and 100) then
      raise exception 'Invalid break period change.' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.break_periods b
      where b.user_id = actor and b.id <> p_id
        and daterange(b.start_date, b.end_date, '[]') && daterange(p_start_date, p_end_date, '[]')
    ) then
      raise exception 'Break periods overlap.' using errcode = '23P01';
    end if;
  end if;

  if (p_start_date, p_end_date, p_weekly_limit_minutes)
       is distinct from (period.start_date, period.end_date, period.weekly_limit_minutes) then
    -- The same local week and per-shift rounding as enforce_shift_weekly_limits
    -- and limit-check.ts. Include every shift, even an archived job's shift.
    -- Drive the calculation from existing shifts so empty weeks cost nothing.
    with spans as (
      select s.starts_at, s.ends_at,
        (s.starts_at at time zone time_zone_name)::date
          - ((extract(dow from (s.starts_at at time zone time_zone_name))::integer - first_day + 7) % 7) as first_week
      from public.shifts s
      where s.user_id = actor
        and s.starts_at >= (least(period.start_date, p_start_date)::timestamp at time zone time_zone_name) - interval '24 hours'
        and s.starts_at < ((greatest(period.end_date, p_end_date) + 7)::timestamp at time zone time_zone_name)
    ), candidates as (
      -- Check both sides. At a repeated midnight, the earlier instant can
      -- have the new local date while still belonging to the preceding week.
      select w.week_start,
        greatest(s.starts_at, w.week_start::timestamp at time zone time_zone_name) as clipped_start,
        least(s.ends_at, (w.week_start + 7)::timestamp at time zone time_zone_name) as clipped_end,
        case when w.week_start between period.start_date and period.end_date
          then period.weekly_limit_minutes else default_cap end as old_cap,
        case when w.week_start between p_start_date and p_end_date
          then p_weekly_limit_minutes else default_cap end as new_cap
      from spans s
      cross join lateral (values (s.first_week - 7), (s.first_week), (s.first_week + 7)) w(week_start)
    ), totals as (
      select week_start, new_cap as cap_minutes,
        sum(round(extract(epoch from clipped_end - clipped_start) / 60)::integer) as scheduled_minutes
      from candidates
      where clipped_start < clipped_end and new_cap is not null and new_cap is distinct from old_cap
      group by week_start, new_cap
    )
    select coalesce(jsonb_agg(to_jsonb(t) order by t.week_start), '[]'::jsonb)
      into affected from totals t where t.scheduled_minutes > t.cap_minutes;
  end if;

  if affected <> '[]'::jsonb then
    -- Bind the acknowledgement to the period, proposed values and the exact
    -- impact shown. If a shift or setting changes the impact, show it again.
    current_confirmation := encode(sha256(convert_to(jsonb_build_array(
      p_id, period.updated_at, p_start_date, p_end_date, p_weekly_limit_minutes, p_label,
      time_zone_name, first_day, affected
    )::text, 'UTF8')), 'hex');
    if p_confirmation is distinct from current_confirmation then
      return query select current_confirmation, affected;
      return;
    end if;
  end if;

  if p_start_date is null then
    delete from public.break_periods b where b.id = p_id and b.user_id = actor;
  else
    update public.break_periods b
      set start_date = p_start_date, end_date = p_end_date, weekly_limit_minutes = p_weekly_limit_minutes, label = p_label
      where b.id = p_id and b.user_id = actor;
  end if;
  return query select null::text, '[]'::jsonb;
end;
$$;

revoke execute on function public.change_break_period(uuid, date, date, integer, text, text) from public, anon, authenticated, service_role;
grant execute on function public.change_break_period(uuid, date, date, integer, text, text) to authenticated;

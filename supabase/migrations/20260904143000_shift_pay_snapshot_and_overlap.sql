-- Two integrity gaps in public.shifts, fixed together because both let a row
-- that looks completely ordinary in the shift log carry a wrong number.
--
--
-- 1. Editing a shift repriced it at the job's *current* rate.
--
-- sync_shift_earnings_snapshot (202608250004) fires `before insert or update`
-- and re-read jobs.hourly_rate_cents unconditionally. So: log a 6h shift at
-- $15.00/h ($81.00 net after 10% tax), take a raise to $18.00/h in March, then
-- fix a typo in that shift's notes -- and the shift silently becomes $97.20,
-- moving every weekly and monthly total that included it. Nothing said so, and
-- the original figure was unrecoverable.
--
-- Snapshotting pay onto the row exists precisely so the row remembers what the
-- work was worth when it was worked. The rate now survives an update; only the
-- amounts follow, when the duration changes. Moving a shift to a different job
-- is the one case that re-reads, because the old job's rate no longer describes
-- it. Deductions are preserved from the snapshot for the same reason, so adding
-- a deduction to a job cannot reprice history either.
--
-- Correcting a rate that was entered wrong is therefore no longer possible by
-- editing the job. That is deliberate: it should be an explicit "re-apply the
-- current rate" action, not a side effect of touching a note.
--
--
-- 2. Nothing rejected overlapping shifts.
--
-- shifts_no_duplicate_span (202608260006) blocks only an exact
-- (user, job, start, end) match, and said so on purpose. But two shifts that
-- merely overlap are the same failure one degree off, and worse, because
-- enforce_shift_weekly_limits sums them as if the user had been in two places:
--
--   * Same job, Mon 09:00-17:00 logged, then Mon 09:00-17:30 re-entered as
--     "I stayed late" instead of edited. Starts match, ends do not, so the
--     unique index passes. 16.5h logged for an 8.5h day.
--   * Different jobs, Mon 09:00-17:00 and Mon 10:00-18:00 (meant for Tuesday).
--     Different job_id, so the unique index never applies. 16h counted against
--     a 20h cap for 8h of work.
--
-- Both read as two normal rows. The cap the app exists to protect is the thing
-- that ends up wrong, in the direction that costs the user hours they were
-- entitled to work. A range exclusion is the exact tool.
--
-- '[)' is load-bearing: half-open means a 09:00-17:00 shift and a 17:00-21:00
-- shift touch without overlapping, so back-to-back shifts stay legal. With '[]'
-- they would be rejected.
--
-- shifts_no_duplicate_span is subsumed by this and kept anyway -- it is the
-- narrower condition, so it yields the more specific "you already logged this
-- exact shift" message, and a btree on those four columns is useful on its own.
--
-- Verified against production before writing: 17 shifts across 3 users, zero
-- overlapping pairs by either definition, so this constraint adopts the
-- existing data unchanged.

create extension if not exists btree_gist with schema extensions;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'shifts_no_overlap' and conrelid = 'public.shifts'::regclass
  ) then
    alter table public.shifts
      add constraint shifts_no_overlap
      exclude using gist (
        user_id with =,
        tstzrange(starts_at, ends_at, '[)') with &&
      );
  end if;
end $$;

comment on constraint shifts_no_overlap on public.shifts is
  'One user cannot be in two places at once. Half-open ranges, so back-to-back shifts remain legal.';

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
  if tg_op = 'UPDATE' and new.job_id = old.job_id then
    -- Same job, existing row: the pay it was worked at is historical fact.
    hourly_rate := old.hourly_rate_cents;
    tax_rate := old.tax_rate_basis_points;
    new.deductions_snapshot := old.deductions_snapshot;
  else
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
  end if;

  shift_minutes := floor(extract(epoch from new.ends_at - new.starts_at) / 60)::integer;
  gross := round((shift_minutes::numeric * hourly_rate) / 60)::integer;

  new.hourly_rate_cents := hourly_rate;
  new.tax_rate_basis_points := tax_rate;
  new.gross_cents := gross;
  new.tax_cents := round((gross::numeric * tax_rate) / 10000)::integer;
  -- Summed from the snapshot rather than the live job_deductions rows, so a
  -- deduction added later cannot reprice a shift that predates it. Rounding is
  -- per deduction then summed, matching calculateEarnings() in src/lib/earnings.ts.
  new.deduction_cents := coalesce((
    select sum(round((gross::numeric * (deduction ->> 'rateBasisPoints')::integer) / 10000)::integer)
    from jsonb_array_elements(new.deductions_snapshot) as deduction
  ), 0);
  new.net_cents := greatest(0, new.gross_cents - new.tax_cents - new.deduction_cents);

  return new;
end;
$$;

comment on function public.sync_shift_earnings_snapshot() is
  'Authoritative earnings snapshot for a shift. Reads the job on insert or when the shift moves job; otherwise preserves the rate the shift was worked at.';

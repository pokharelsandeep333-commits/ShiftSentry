alter table public.jobs
  add column hourly_rate_cents integer not null default 0 check (hourly_rate_cents between 0 and 1000000),
  add column tax_rate_basis_points integer not null default 0 check (tax_rate_basis_points between 0 and 10000);

create table public.job_deductions (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  rate_basis_points integer not null check (rate_basis_points between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shifts
  add column hourly_rate_cents integer not null default 0 check (hourly_rate_cents between 0 and 1000000),
  add column tax_rate_basis_points integer not null default 0 check (tax_rate_basis_points between 0 and 10000),
  add column deductions_snapshot jsonb not null default '[]'::jsonb,
  add column gross_cents integer not null default 0 check (gross_cents >= 0),
  add column tax_cents integer not null default 0 check (tax_cents >= 0),
  add column deduction_cents integer not null default 0 check (deduction_cents >= 0),
  add column net_cents integer not null default 0 check (net_cents >= 0);

create index job_deductions_job_idx on public.job_deductions(job_id);
create trigger job_deductions_updated_at before update on public.job_deductions for each row execute procedure public.set_updated_at();

alter table public.job_deductions enable row level security;
create policy "users manage own job deductions" on public.job_deductions for all
  using (exists (select 1 from public.jobs where jobs.id = job_id and jobs.user_id = auth.uid()))
  with check (exists (select 1 from public.jobs where jobs.id = job_id and jobs.user_id = auth.uid()));

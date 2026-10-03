-- A free-text note per week of the shift log ("asked for Friday off",
-- "paycheck short 2h").
--
-- A week is a run of the user's local days, so the key is the local date the
-- week starts on (weekStartFor in src/lib/time.ts), not an instant. That start
-- depends on the profile's week_starts_on and time zone, which the database
-- cannot check here; saveWeekNote does. A note saved before the user changed
-- their week-start day still sits inside one of the new weeks, and the shift
-- log moves it onto that week's start the next time it is saved
-- (src/lib/week-notes.ts).
--
-- An empty note is no row at all: clearing a note deletes it, so the check
-- only admits a body with something in it.

create table public.week_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Leads with user_id, so it also serves the RLS predicate and the foreign key.
  constraint week_notes_one_per_week unique (user_id, week_start)
);

comment on table public.week_notes is
  'One free-text note per user per local week, keyed on the local date the week starts.';

create trigger week_notes_updated_at
before update on public.week_notes
for each row execute procedure public.set_updated_at();

alter table public.week_notes enable row level security;

revoke all on public.week_notes from public, anon, authenticated;
grant select, insert, update, delete on public.week_notes to authenticated;

create policy "users read their own week notes" on public.week_notes
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "users create their own week notes" on public.week_notes
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "users update their own week notes" on public.week_notes
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "users delete their own week notes" on public.week_notes
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Same lock-out as jobs, shifts and deductions (20260926120000 section 5): a
-- token issued before the ban still reaches PostgREST until it expires.
create policy "disabled accounts are locked out of week notes" on public.week_notes
  as restrictive for all to authenticated
  using ((select public.is_account_enabled()))
  with check ((select public.is_account_enabled()));

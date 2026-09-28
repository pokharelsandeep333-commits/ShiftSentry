-- One Google Calendar connection per user, for the read-only calendar feature.
--
-- Only credentials and preferences live here. Events are fetched from Google per
-- request and never stored, which is what /privacy promises.
--
-- The tokens are ciphertext (AES-256-GCM, key outside the database, the row's
-- user_id bound in as associated data). The server reads this row through the
-- RLS client as the user -- the same role a stolen session holds -- so the
-- encryption is what keeps a stolen session from yielding a durable Google
-- credential. RLS keeps the rows private between users; it cannot do that job.

create table public.google_calendar_connections (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  google_email text not null check (char_length(google_email) between 3 and 320),
  refresh_token_ciphertext text not null,
  access_token_ciphertext text,
  access_token_expires_at timestamptz,
  scopes text[] not null,
  selected_calendar_ids text[] not null default array['primary']
    check (cardinality(selected_calendar_ids) between 1 and 25),
  status text not null default 'active' check (status in ('active', 'needs_reconnect')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.google_calendar_connections is
  'Encrypted Google OAuth tokens and calendar selection for the read-only Google Calendar feature. No event data.';

create trigger google_calendar_connections_updated_at
before update on public.google_calendar_connections
for each row execute procedure public.set_updated_at();

alter table public.google_calendar_connections enable row level security;

revoke all on public.google_calendar_connections from public, anon, authenticated;
grant select, insert, update, delete on public.google_calendar_connections to authenticated;

create policy "users read their own google connection" on public.google_calendar_connections
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "users create their own google connection" on public.google_calendar_connections
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "users update their own google connection" on public.google_calendar_connections
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "users delete their own google connection" on public.google_calendar_connections
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Same lock-out as jobs, shifts and deductions (20260926120000 section 5).
create policy "disabled accounts are locked out of google connections" on public.google_calendar_connections
  as restrictive for all to authenticated
  using ((select public.is_account_enabled()))
  with check ((select public.is_account_enabled()));

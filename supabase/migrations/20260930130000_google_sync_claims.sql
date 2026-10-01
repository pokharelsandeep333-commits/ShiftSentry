-- The Google shift sync throttle moves out of the user's reach.
--
-- A sync run was claimed with a conditional update of
-- google_calendar_connections.shifts_synced_at, through the RLS client, as the
-- user. That column sat in a row its owner can update -- and delete and
-- re-insert, ciphertext included -- so setting it back to null admitted another
-- run at once, as often as the owner liked, each one fanning out over every
-- selected and job calendar against the app's shared Google quota.
--
-- The claim now lives in its own table that the API roles cannot touch, and is
-- taken only through `claim_google_shift_sync`, which applies the same budget
-- the app always meant: one run per five minutes, or per thirty seconds for an
-- explicit "Sync now". The row is keyed on the profile, not the connection, so
-- disconnecting and reconnecting does not reset it either.

create table public.google_sync_claims (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  claimed_at timestamptz not null
);

comment on table public.google_sync_claims is
  'When each user''s last Google shift sync run was admitted. Written only by claim_google_shift_sync.';

alter table public.google_sync_claims enable row level security;

-- No policies on purpose: nothing but the security definer function below
-- reads or writes this table.
revoke all on public.google_sync_claims from public, anon, authenticated;

create or replace function public.claim_google_shift_sync(p_force boolean default false)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  spacing interval := case when p_force then interval '30 seconds' else interval '5 minutes' end;
begin
  if actor is null or not public.is_account_enabled() then
    return false;
  end if;

  -- One statement, so two tabs (or two "Sync now" taps) cannot both claim.
  insert into public.google_sync_claims as claim (user_id, claimed_at)
  values (actor, now())
  on conflict (user_id) do update
    set claimed_at = excluded.claimed_at
    where claim.claimed_at < now() - spacing;

  return found;
end;
$$;

comment on function public.claim_google_shift_sync(boolean) is
  'Admits one Google shift sync run for the caller: true at most once per five minutes, or per thirty seconds when forced.';

revoke execute on function public.claim_google_shift_sync(boolean) from public, anon;
grant execute on function public.claim_google_shift_sync(boolean) to authenticated;

-- The old claim column goes, so nothing can go on trusting it.
alter table public.google_calendar_connections drop column shifts_synced_at;

create type public.app_role as enum ('USER', 'ADMIN');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  role public.app_role not null default 'USER',
  time_zone text not null default 'America/Chicago',
  week_starts_on integer not null default 0 check (week_starts_on between 0 and 6),
  global_weekly_limit_minutes integer check (global_weekly_limit_minutes between 1 and 10080),
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  color text not null default '#9486ff' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  weekly_limit_minutes integer check (weekly_limit_minutes between 1 and 10080),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete restrict,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  notes text check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shifts_valid_interval check (ends_at > starts_at and ends_at - starts_at <= interval '24 hours')
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index jobs_user_active_idx on public.jobs(user_id, archived_at);
create index shifts_user_starts_idx on public.shifts(user_id, starts_at);
create index shifts_job_starts_idx on public.shifts(job_id, starts_at);
create index audit_events_created_idx on public.audit_events(created_at desc);

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, nullif(new.raw_user_meta_data ->> 'full_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
create trigger jobs_updated_at before update on public.jobs for each row execute procedure public.set_updated_at();
create trigger shifts_updated_at before update on public.shifts for each row execute procedure public.set_updated_at();

create function public.prevent_profile_privilege_changes() returns trigger language plpgsql set search_path = '' as $$
begin
  if auth.uid() = old.id and (new.role is distinct from old.role or new.disabled_at is distinct from old.disabled_at or new.email is distinct from old.email) then
    raise exception 'Only an administrator can change account privileges.';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_privileges before update on public.profiles for each row execute procedure public.prevent_profile_privilege_changes();

alter table public.profiles enable row level security;
alter table public.jobs enable row level security;
alter table public.shifts enable row level security;
alter table public.audit_events enable row level security;

create policy "users read own profile" on public.profiles for select using ((select auth.uid()) = id);
create policy "users update own profile" on public.profiles for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "users manage own jobs" on public.jobs for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "users manage own shifts" on public.shifts for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "admins read audit log" on public.audit_events for select using ((select role from public.profiles where id = auth.uid()) = 'ADMIN');

-- Minimal stand-ins for what the Supabase platform provides, so the repo's
-- migrations can be applied to a bare Postgres container.
--
-- This is a verification harness, not part of the project.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

grant usage on schema public to anon, authenticated, service_role;

-- Supabase projects carry default privileges granting new public objects to
-- these roles. Reproduce that, because the game migrations' `revoke all ...`
-- statements exist specifically to undo it -- without it here, the revokes
-- would be no-ops and the test would not exercise what production does.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

create schema auth;

create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

-- The real auth.uid() reads the verified JWT. Here it reads a GUC the tests set,
-- which is enough to exercise every policy and every `(select auth.uid())`.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create extension if not exists btree_gist;

-- Stand-in for the Supabase Realtime schema, matching the signatures verified
-- against the live project:
--   realtime.send(payload jsonb, event text, topic text, private boolean)
--   realtime.topic() returns text
create schema realtime;

create table realtime.messages (
  id bigint generated always as identity primary key,
  topic text not null,
  event text,
  payload jsonb,
  private boolean not null default false,
  inserted_at timestamptz not null default now()
);

alter table realtime.messages enable row level security;
-- Supabase grants these on a real project; without them the policy is never
-- reached and the test fails on schema access instead of on authorization.
grant usage on schema realtime to anon, authenticated;
grant select on realtime.messages to authenticated;

create or replace function realtime.send(payload jsonb, event text, topic text, private boolean)
returns void
language sql
as $$
  insert into realtime.messages (topic, event, payload, private)
  values (topic, event, payload, private);
$$;

-- The real one reads the channel being authorized. Here it reads a GUC the
-- tests set, which is enough to exercise the policy.
create or replace function realtime.topic()
returns text
language sql
stable
as $$
  select nullif(current_setting('realtime.topic', true), '');
$$;

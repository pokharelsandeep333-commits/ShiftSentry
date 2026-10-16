-- Site announcements: a short notice an admin posts (planned maintenance, a
-- known problem) that every signed-in user sees as a banner until it is
-- cleared. Not personal data about users; no export, no agreement trigger.
--
-- Signed-in users may read the live notice's text and nothing else: not past
-- notices, and not which admin posted or cleared it. Only the server writes
-- (Prisma's owner connection), and each post and clear is audited by the
-- action that makes it.

create table public.site_announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null constraint site_announcements_message_length check (char_length(btrim(message)) between 1 and 280),
  tone text not null default 'info' constraint site_announcements_tone check (tone in ('info', 'warning')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  cleared_at timestamptz,
  cleared_by uuid references public.profiles(id) on delete set null
);

-- At most one live notice: posting a new one clears the old in the same
-- transaction, and this makes two live ones impossible rather than unlikely.
create unique index site_announcements_one_live on public.site_announcements ((true)) where cleared_at is null;
-- The admin page's history, newest first.
create index site_announcements_created on public.site_announcements (created_at desc);
-- Index the ON DELETE SET NULL lookups when an admin's account is deleted.
create index site_announcements_created_by on public.site_announcements (created_by);
create index site_announcements_cleared_by on public.site_announcements (cleared_by);

alter table public.site_announcements enable row level security;
revoke all on table public.site_announcements from public, anon, authenticated;
-- Column grant: the banner needs the text, the tone, an id to remember a
-- dismissal by, and the date. Which admin posted it stays server-side.
grant select (id, message, tone, created_at, cleared_at) on public.site_announcements to authenticated;
grant select, insert, update on table public.site_announcements to service_role;

create policy "Signed-in users read the live announcement" on public.site_announcements
  for select to authenticated
  using (cleared_at is null);

comment on table public.site_announcements is
  'Admin-posted banner notices. At most one live (cleared_at is null); users read only the live one''s text.';

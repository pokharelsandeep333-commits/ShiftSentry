\set ON_ERROR_STOP on
begin;

-- Site announcements (20261016140000): signed-in users read the live notice's
-- text only; nobody but the server writes; there is never more than one live.

insert into auth.users(id,email) values
  ('6e000000-0000-4000-8000-000000000001','announce-admin@example.com'),
  ('6e000000-0000-4000-8000-000000000002','announce-reader@example.com');

do $$
declare
  admin_id constant uuid := '6e000000-0000-4000-8000-000000000001';
  reader_id constant uuid := '6e000000-0000-4000-8000-000000000002';
  live_id uuid; seen integer; refused boolean; message_seen text;
begin
  -- The server posts a notice, clears it, posts another.
  set local role postgres;
  insert into public.site_announcements(message, tone, created_by, cleared_at, cleared_by)
    values ('Old notice', 'info', admin_id, now(), admin_id);
  insert into public.site_announcements(message, tone, created_by) values ('Maintenance tonight 10-11 PM', 'warning', admin_id) returning id into live_id;

  -- Two live notices are impossible.
  refused := false;
  begin insert into public.site_announcements(message) values ('A second live notice'); exception when unique_violation then refused := true; end;
  if not refused then raise exception 'a second live notice was accepted'; end if;
  refused := false;
  begin insert into public.site_announcements(message) values ('   '); exception when check_violation then refused := true; end;
  if not refused then raise exception 'a blank notice was accepted'; end if;
  refused := false;
  begin insert into public.site_announcements(message, tone) values ('Bad tone', 'urgent'); exception when check_violation then refused := true; end;
  if not refused then raise exception 'an unknown tone was accepted'; end if;

  -- A signed-in user sees the live notice, and only it.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', reader_id::text, true);
  select count(*) into seen from public.site_announcements;
  if seen <> 1 then raise exception 'reader saw % notices, expected only the live one', seen; end if;
  select message into message_seen from public.site_announcements;
  if message_seen <> 'Maintenance tonight 10-11 PM' then raise exception 'reader saw the wrong notice: %', message_seen; end if;

  -- ...but not who posted it.
  refused := false;
  begin perform created_by from public.site_announcements; exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception 'reader could see who posted the notice'; end if;

  -- ...and cannot post, edit, clear or delete one.
  refused := false;
  begin insert into public.site_announcements(message) values ('Reader notice'); exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception 'reader could post a notice'; end if;
  refused := false;
  begin update public.site_announcements set message = 'Edited' where id = live_id; exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception 'reader could edit the notice'; end if;
  refused := false;
  begin update public.site_announcements set cleared_at = now() where id = live_id; exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception 'reader could clear the notice'; end if;
  refused := false;
  begin delete from public.site_announcements where id = live_id; exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception 'reader could delete the notice'; end if;

  -- Signed out sees nothing at all.
  set local role anon;
  perform set_config('request.jwt.claim.sub', '', true);
  refused := false;
  begin perform 1 from public.site_announcements; exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception 'anon could read announcements'; end if;

  -- Once cleared, nobody signed in sees it.
  set local role postgres;
  update public.site_announcements set cleared_at = now(), cleared_by = admin_id where id = live_id;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', reader_id::text, true);
  select count(*) into seen from public.site_announcements;
  if seen <> 0 then raise exception 'a cleared notice is still visible'; end if;

  -- Deleting the admin keeps the history, unattributed.
  set local role postgres;
  perform set_config('request.jwt.claim.sub', '', true);
  delete from auth.users where id = admin_id;
  if exists (select 1 from public.site_announcements where created_by = admin_id or cleared_by = admin_id) then raise exception 'a deleted admin is still named on announcements'; end if;
  select count(*) into seen from public.site_announcements;
  if seen <> 2 then raise exception 'announcement history was lost with the admin'; end if;
end;
$$;

reset role;
rollback;

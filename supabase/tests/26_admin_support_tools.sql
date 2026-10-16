\set ON_ERROR_STOP on
begin;

-- Admin support tools (20261016120000): ending a user's sessions and private
-- support notes. Neither may be reachable by an API role a user holds; the
-- session function ends only the named user's sessions; notes are in their
-- subject's export (without the author), never in anyone else's, and go with
-- the account.

insert into auth.users(id,email) values
  ('6c000000-0000-4000-8000-000000000001','support-subject@example.com'),
  ('6c000000-0000-4000-8000-000000000002','support-bystander@example.com'),
  ('6c000000-0000-4000-8000-000000000003','support-admin@example.com');

do $$
declare
  subject_id constant uuid := '6c000000-0000-4000-8000-000000000001';
  bystander_id constant uuid := '6c000000-0000-4000-8000-000000000002';
  admin_id constant uuid := '6c000000-0000-4000-8000-000000000003';
  subject_session uuid; bystander_session uuid; removed integer; refused boolean; exported jsonb; note_count integer;
begin
  -- Two sessions for the subject, one for a bystander, each with a refresh token.
  insert into auth.sessions(user_id) values (subject_id) returning id into subject_session;
  insert into auth.sessions(user_id) values (subject_id);
  insert into auth.sessions(user_id) values (bystander_id) returning id into bystander_session;
  insert into auth.refresh_tokens(token,user_id,session_id) values ('subject-token',subject_id::text,subject_session), ('bystander-token',bystander_id::text,bystander_session);

  -- A signed-in user cannot end anyone's sessions, their own included.
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',bystander_id::text,true);
  refused := false;
  begin perform public.admin_revoke_user_sessions(subject_id); exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception 'a user could end another user''s sessions'; end if;
  set local role anon;
  perform set_config('request.jwt.claim.sub','',true);
  refused := false;
  begin perform public.admin_revoke_user_sessions(subject_id); exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception 'anon could end sessions'; end if;

  -- The server can, and it touches only the named user.
  set local role service_role;
  removed := public.admin_revoke_user_sessions(subject_id);
  if removed <> 2 then raise exception 'expected 2 sessions removed, got %', removed; end if;
  set local role postgres;
  if exists(select 1 from auth.sessions where user_id = subject_id) then raise exception 'subject session survived'; end if;
  if exists(select 1 from auth.refresh_tokens where token = 'subject-token') then raise exception 'subject refresh token survived its session'; end if;
  if not exists(select 1 from auth.sessions where user_id = bystander_id) then raise exception 'bystander session was removed'; end if;
  if not exists(select 1 from auth.refresh_tokens where token = 'bystander-token') then raise exception 'bystander refresh token was removed'; end if;
  set local role service_role;
  if public.admin_revoke_user_sessions(subject_id) <> 0 then raise exception 'a second call found sessions to remove'; end if;

  -- Notes: the server writes them; no user role can read or write one. Written
  -- as the owner, which is how the app writes them (Prisma). The harness's
  -- stand-in service_role lacks the BYPASSRLS the hosted one has, so it would
  -- be refused here for a reason production does not share.
  set local role postgres;
  insert into public.admin_user_notes(user_id,author_id,body) values (subject_id,admin_id,'Asked about a missing shift on 10/02; it was archived with its job.');
  insert into public.admin_user_notes(user_id,author_id,body) values (bystander_id,admin_id,'Bystander note that must stay private.');
  refused := false;
  begin insert into public.admin_user_notes(user_id,author_id,body) values (subject_id,admin_id,'   '); exception when check_violation then refused := true; end;
  if not refused then raise exception 'a blank note was accepted'; end if;
  refused := false;
  begin insert into public.admin_user_notes(user_id,author_id,body) values (subject_id,admin_id,repeat('x',2001)); exception when check_violation then refused := true; end;
  if not refused then raise exception 'an over-long note was accepted'; end if;

  set local role authenticated;
  perform set_config('request.jwt.claim.sub',subject_id::text,true);
  refused := false;
  begin perform 1 from public.admin_user_notes; exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception 'a user could read support notes'; end if;
  refused := false;
  begin insert into public.admin_user_notes(user_id,body) values (subject_id,'self-written'); exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception 'a user could write a support note'; end if;
  refused := false;
  begin delete from public.admin_user_notes where user_id = subject_id; exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception 'a user could delete their support notes'; end if;

  -- The subject's export carries their note, without who wrote it, and not the bystander's.
  exported := public.export_account_data();
  if jsonb_array_length(exported->'supportNotes') <> 1 then raise exception 'export should hold exactly the subject''s one note: %', exported->'supportNotes'; end if;
  if exported->'supportNotes'->0->>'body' not like 'Asked about a missing shift%' then raise exception 'export holds the wrong note'; end if;
  if exported->'supportNotes'->0 ? 'author_id' then raise exception 'export reveals the note''s author'; end if;
  perform set_config('request.jwt.claim.sub',bystander_id::text,true);
  exported := public.export_account_data();
  if exported->'supportNotes'->0->>'body' <> 'Bystander note that must stay private.' then raise exception 'bystander export is wrong'; end if;

  -- Deleting the admin keeps their notes, unattributed; deleting the subject removes theirs.
  set local role postgres;
  perform set_config('request.jwt.claim.sub','',true);
  delete from auth.users where id = admin_id;
  if exists(select 1 from public.admin_user_notes where author_id is not null and user_id in (subject_id, bystander_id)) then raise exception 'a deleted admin is still named on notes'; end if;
  delete from auth.users where id = subject_id;
  select count(*) into note_count from public.admin_user_notes where user_id = subject_id;
  if note_count <> 0 then raise exception 'notes outlived their subject'; end if;
  delete from auth.users where id = bystander_id;
  if exists(select 1 from auth.sessions where user_id = bystander_id) then raise exception 'sessions outlived their user'; end if;
end;
$$;

reset role;
rollback;

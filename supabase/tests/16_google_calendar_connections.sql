\set ON_ERROR_STOP on

-- Google Calendar connections are private to their owner, go with the profile,
-- and are closed to a disabled account like every other table of personal data.
-- Alice owns one; Bob must not see or touch it. The disabled and cascade cases
-- use throwaway accounts, so no shared fixture moves for later suites.

do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob constant uuid := '22222222-2222-2222-2222-222222222222';
  grace constant uuid := '77777777-7777-7777-7777-777777777777';
  seen integer; touched integer; refused boolean;
begin
  execute 'set local role authenticated';

  -- ---- the owner can create, read and update her own row ----------------------
  perform set_config('request.jwt.claim.sub', alice::text, true);
  insert into public.google_calendar_connections (user_id, google_email, refresh_token_ciphertext, scopes)
    values (alice, 'alice@gmail.com', 'v1:opaque', array['openid']);
  select count(*) into seen from public.google_calendar_connections;
  if seen <> 1 then raise exception 'Alice sees % connection rows, expected 1', seen; end if;
  update public.google_calendar_connections set selected_calendar_ids = array['primary', 'work'] where user_id = alice;
  get diagnostics touched = row_count;
  if touched <> 1 then raise exception 'Alice could not update her own connection'; end if;

  -- Disconnect deletes the row as the user. Without an owner delete policy the
  -- delete matches nothing and PostgREST reports no error, so pin the count.
  delete from public.google_calendar_connections where user_id = alice;
  get diagnostics touched = row_count;
  if touched <> 1 then raise exception 'Alice could not delete her own connection'; end if;
  insert into public.google_calendar_connections (user_id, google_email, refresh_token_ciphertext, scopes)
    values (alice, 'alice@gmail.com', 'v1:opaque', array['openid']);

  -- ---- nobody can write a row for someone else --------------------------------
  refused := false;
  begin
    insert into public.google_calendar_connections (user_id, google_email, refresh_token_ciphertext, scopes)
      values (bob, 'mallory@gmail.com', 'v1:opaque', array['openid']);
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'Alice inserted a connection for Bob'; end if;

  -- ---- another user sees and changes nothing ----------------------------------
  perform set_config('request.jwt.claim.sub', bob::text, true);
  select count(*) into seen from public.google_calendar_connections;
  if seen <> 0 then raise exception 'Bob can see % of Alice''s connection rows', seen; end if;
  update public.google_calendar_connections set status = 'needs_reconnect' where user_id = alice;
  get diagnostics touched = row_count;
  if touched <> 0 then raise exception 'Bob updated Alice''s connection'; end if;
  delete from public.google_calendar_connections where user_id = alice;
  get diagnostics touched = row_count;
  if touched <> 0 then raise exception 'Bob deleted Alice''s connection'; end if;

  -- ---- status is constrained --------------------------------------------------
  perform set_config('request.jwt.claim.sub', alice::text, true);
  refused := false;
  begin
    update public.google_calendar_connections set status = 'bogus' where user_id = alice;
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'status accepted a value outside the check'; end if;

  -- ---- a disabled account is locked out ---------------------------------------
  -- Every command, not only reads: a token issued before the ban still reaches
  -- PostgREST, so insert and delete are pinned as well as select and update.
  execute 'set local role postgres';
  perform set_config('request.jwt.claim.sub', '', true);
  insert into auth.users (id, email) values (grace, 'grace@example.com');
  insert into public.google_calendar_connections (user_id, google_email, refresh_token_ciphertext, scopes)
    values (grace, 'grace@gmail.com', 'v1:opaque', array['openid']);
  update public.profiles set disabled_at = now() where id = grace;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', grace::text, true);
  select count(*) into seen from public.google_calendar_connections;
  if seen <> 0 then raise exception 'a disabled account can still read its connection'; end if;
  update public.google_calendar_connections set status = 'needs_reconnect' where user_id = grace;
  get diagnostics touched = row_count;
  if touched <> 0 then raise exception 'a disabled account can still update its connection'; end if;
  delete from public.google_calendar_connections where user_id = grace;
  get diagnostics touched = row_count;
  if touched <> 0 then raise exception 'a disabled account can still delete its connection'; end if;

  execute 'set local role postgres';
  perform set_config('request.jwt.claim.sub', '', true);
  delete from public.google_calendar_connections where user_id = grace;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', grace::text, true);
  refused := false;
  begin
    insert into public.google_calendar_connections (user_id, google_email, refresh_token_ciphertext, scopes)
      values (grace, 'grace@gmail.com', 'v1:opaque', array['openid']);
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'a disabled account can still create a connection'; end if;

  execute 'set local role postgres';
  perform set_config('request.jwt.claim.sub', '', true);
  delete from auth.users where id = grace;

  -- ---- anon has no access at all ----------------------------------------------
  execute 'set local role anon';
  refused := false;
  begin
    perform 1 from public.google_calendar_connections;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'anon can select from google_calendar_connections'; end if;

  -- ---- updated_at moves on update ---------------------------------------------
  execute 'set local role postgres';
  update public.google_calendar_connections set updated_at = '2000-01-01' where user_id = alice;
  update public.google_calendar_connections set status = 'needs_reconnect' where user_id = alice;
  if (select updated_at from public.google_calendar_connections where user_id = alice) < now() - interval '1 minute' then
    raise exception 'updated_at did not move on update';
  end if;

  -- ---- the row goes with the profile (a throwaway user, so no suite's fixture moves)
  insert into auth.users (id, email) values ('66666666-6666-6666-6666-666666666666', 'frank@example.com');
  insert into public.google_calendar_connections (user_id, google_email, refresh_token_ciphertext, scopes)
    values ('66666666-6666-6666-6666-666666666666', 'frank@gmail.com', 'v1:opaque', array['openid']);
  delete from public.profiles where id = '66666666-6666-6666-6666-666666666666';
  select count(*) into seen from public.google_calendar_connections where user_id = '66666666-6666-6666-6666-666666666666';
  if seen <> 0 then raise exception 'deleting a profile left its Google connection behind'; end if;
  delete from auth.users where id = '66666666-6666-6666-6666-666666666666';
end;
$$;

-- Leave no connection rows for any later suite.
reset role;
delete from public.google_calendar_connections;

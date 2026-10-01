\set ON_ERROR_STOP on

-- The Google sync budget is the server's, not the user's.
--
-- Pins 20260930130000. The run used to be claimed with a column on the user's
-- own connection row, which the user could set back to null -- or delete and
-- re-insert -- to start another run at once. The claim now lives in a table the
-- API roles cannot reach, taken only through claim_google_shift_sync.
--
-- Uses throwaway accounts (Hana, Ivan) so no shared fixture moves.

do $$
declare
  hana constant uuid := '88888888-8888-8888-8888-888888888888';
  ivan constant uuid := '99999999-9999-9999-9999-999999999999';
  granted boolean; refused boolean; seen integer;
begin
  insert into auth.users (id, email) values (hana, 'hana@example.com'), (ivan, 'ivan@example.com');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', hana::text, true);

  -- ---- one run per window -----------------------------------------------------
  if not public.claim_google_shift_sync(false) then raise exception 'the first claim was refused'; end if;
  if public.claim_google_shift_sync(false) then raise exception 'a second run was admitted inside five minutes'; end if;
  if public.claim_google_shift_sync(true) then raise exception 'a forced run was admitted inside thirty seconds'; end if;
  raise notice 'one run per window, forced or not';

  -- Another user has a budget of her own.
  perform set_config('request.jwt.claim.sub', ivan::text, true);
  if not public.claim_google_shift_sync(false) then raise exception 'Hana''s claim used up Ivan''s'; end if;
  perform set_config('request.jwt.claim.sub', hana::text, true);

  -- ---- the user cannot reset it -----------------------------------------------
  refused := false;
  begin
    update public.google_sync_claims set claimed_at = '2000-01-01' where user_id = hana;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'LEAK: a user rewound her own sync claim'; end if;
  refused := false;
  begin
    delete from public.google_sync_claims where user_id = hana;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'LEAK: a user deleted her own sync claim'; end if;
  refused := false;
  begin
    select count(*) into seen from public.google_sync_claims;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'LEAK: a user can read the sync claims'; end if;

  -- Reconnecting -- the old bypass -- does not touch it either.
  insert into public.google_calendar_connections (user_id, google_email, refresh_token_ciphertext, scopes)
    values (hana, 'hana@gmail.com', 'v1:opaque', array['openid']);
  delete from public.google_calendar_connections where user_id = hana;
  insert into public.google_calendar_connections (user_id, google_email, refresh_token_ciphertext, scopes)
    values (hana, 'hana@gmail.com', 'v1:opaque', array['openid']);
  if public.claim_google_shift_sync(false) then raise exception 'LEAK: reconnecting reset the sync budget'; end if;
  raise notice 'the claim cannot be read, rewound, deleted, or reset by reconnecting';

  -- ---- the window reopens -------------------------------------------------------
  execute 'set local role postgres';
  update public.google_sync_claims set claimed_at = now() - interval '45 seconds' where user_id = hana;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', hana::text, true);
  if public.claim_google_shift_sync(false) then raise exception 'an unforced run was admitted after 45 seconds'; end if;
  if not public.claim_google_shift_sync(true) then raise exception 'a forced run was refused after 45 seconds'; end if;

  execute 'set local role postgres';
  update public.google_sync_claims set claimed_at = now() - interval '6 minutes' where user_id = hana;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', hana::text, true);
  if not public.claim_google_shift_sync(false) then raise exception 'a run was refused after six minutes'; end if;
  raise notice 'forced after thirty seconds, unforced after five minutes';

  -- ---- nobody without an enabled account claims -------------------------------
  execute 'set local role postgres';
  perform set_config('request.jwt.claim.sub', '', true);
  update public.google_sync_claims set claimed_at = now() - interval '1 hour' where user_id = hana;
  update public.profiles set disabled_at = now() where id = hana;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', hana::text, true);
  if public.claim_google_shift_sync(true) then raise exception 'LEAK: a disabled account claimed a sync run'; end if;

  execute 'set local role anon';
  perform set_config('request.jwt.claim.sub', '', true);
  refused := false;
  begin
    granted := public.claim_google_shift_sync(true);
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'LEAK: anon can call claim_google_shift_sync'; end if;
  raise notice 'disabled accounts and anon cannot claim';

  -- ---- the claim goes with the account ----------------------------------------
  execute 'set local role postgres';
  delete from auth.users where id in (hana, ivan);
  select count(*) into seen from public.google_sync_claims where user_id in (hana, ivan);
  if seen <> 0 then raise exception 'deleting the accounts left % sync claim(s)', seen; end if;
end;
$$;

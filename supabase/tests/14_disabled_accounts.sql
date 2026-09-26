\set ON_ERROR_STOP on

-- A disabled account is locked out at the database.
--
-- Pins section 5 of 20260926120000. The Auth ban stops new sign-ins, but an
-- access token already issued keeps working until it expires, and the only
-- disabled check used to be the Next.js redirect. Here Erin is disabled while
-- holding a job and hosting a room, then acts through the API role exactly as
-- a still-valid token would.
--
-- Runs last: it re-enables Erin at the end, but every seat she held is gone.

create temp table disabled_fixture (room_id uuid, room_code text);

do $$
declare
  erin constant uuid := '55555555-5555-5555-5555-555555555555';
  dave constant uuid := '44444444-4444-4444-4444-444444444444';
  new_code text;
begin
  insert into public.jobs (id, user_id, name) values
    ('b0000000-0000-4000-8000-000000000001', erin, 'Before the ban');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', erin::text, true);
  new_code := public.create_game_room('Erin');
  perform set_config('request.jwt.claim.sub', dave::text, true);
  perform public.join_game_room(new_code);

  execute 'set local role postgres';
  insert into disabled_fixture
    select id, code from public.game_rooms where code = new_code and status = 'LOBBY';
end;
$$;

do $$
declare
  erin constant uuid := '55555555-5555-5555-5555-555555555555';
  dave constant uuid := '44444444-4444-4444-4444-444444444444';
  fixture record; seen integer; touched integer; host_now uuid; refused boolean;
begin
  select * into fixture from disabled_fixture;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', erin::text, true);
  select count(*) into seen from public.jobs;
  if seen < 1 then raise exception 'an enabled Erin could not see her own job'; end if;

  -- Disabled the way setAccountDisabled does it: a role that bypasses RLS, and
  -- no user claim -- with Erin's still set, prevent_profile_privilege_changes
  -- would rightly read it as Erin changing her own status.
  execute 'set local role postgres';
  perform set_config('request.jwt.claim.sub', '', true);
  update public.profiles set disabled_at = now() where id = erin;

  -- ---- she is out of every room, and the room carries on without her -------
  select count(*) into seen from public.game_room_players where user_id = erin;
  if seen <> 0 then raise exception 'a disabled account still holds % seat(s)', seen; end if;
  select host_id into host_now from public.game_rooms where id = fixture.room_id;
  if host_now <> dave then raise exception 'the room she hosted went to % rather than Dave', host_now; end if;
  raise notice 'disabling left every room and handed hers to Dave';

  -- ---- her token no longer reaches her data ---------------------------------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', erin::text, true);

  select count(*) into seen from public.jobs;
  if seen <> 0 then raise exception 'LEAK: a disabled account can read % job(s)', seen; end if;
  select count(*) into seen from public.shifts;
  if seen <> 0 then raise exception 'LEAK: a disabled account can read % shift(s)', seen; end if;
  select count(*) into seen from public.job_deductions;
  if seen <> 0 then raise exception 'LEAK: a disabled account can read % deduction(s)', seen; end if;

  refused := false;
  begin
    insert into public.jobs (user_id, name) values (erin, 'After the ban');
  exception when insufficient_privilege then
    refused := true;
  end;
  if not refused then raise exception 'LEAK: a disabled account created a job'; end if;

  update public.jobs set name = 'Renamed after the ban' where user_id = erin;
  get diagnostics touched = row_count;
  if touched <> 0 then raise exception 'LEAK: a disabled account renamed % job(s)', touched; end if;
  raise notice 'jobs, shifts and deductions: unreadable and unwritable';

  -- ---- the profile stays readable, so the app can say why -------------------
  select count(*) into seen from public.profiles where id = erin and disabled_at is not null;
  if seen <> 1 then raise exception 'a disabled account cannot read the flag that explains it'; end if;

  update public.profiles set display_name = 'Still here' where id = erin;
  get diagnostics touched = row_count;
  if touched <> 0 then raise exception 'LEAK: a disabled account edited its profile'; end if;
  raise notice 'profile: readable (for /account-disabled), not editable';

  -- ---- and she cannot take a seat again --------------------------------------
  refused := false;
  begin
    perform public.create_game_room('Erin');
  exception when sqlstate 'P0001' then
    if sqlerrm !~ 'disabled' then raise; end if;
    refused := true;
  end;
  if not refused then raise exception 'LEAK: a disabled account created a room'; end if;

  refused := false;
  begin
    perform public.join_game_room(fixture.room_code);
  exception when sqlstate 'P0001' then
    if sqlerrm !~ 'disabled' then raise; end if;
    refused := true;
  end;
  if not refused then raise exception 'LEAK: a disabled account rejoined a room'; end if;

  select count(*) into seen from public.game_room_players where room_id = fixture.room_id;
  if seen <> 0 then raise exception 'LEAK: a disabled account can read a room''s roster'; end if;
  raise notice 'game: cannot create, cannot join, cannot see';

  -- ---- re-enabling restores access, but not the old seats ------------------
  execute 'set local role postgres';
  perform set_config('request.jwt.claim.sub', '', true);
  update public.profiles set disabled_at = null where id = erin;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', erin::text, true);
  select count(*) into seen from public.jobs;
  if seen < 1 then raise exception 're-enabled Erin still cannot see her job'; end if;
  perform public.join_game_room(fixture.room_code);
  raise notice 're-enabled: data is back, and she rejoins like anyone else';
end;
$$;

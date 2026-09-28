\set ON_ERROR_STOP on

-- Shifts synced from Google Calendar: a shift is linked to one Google event or
-- to none, never half; one event feeds at most one of a user's shifts; the
-- per-job sync settings and the connection's issue list are bounded; and a
-- linked shift is as private as any other.

do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob constant uuid := '22222222-2222-2222-2222-222222222222';
  job constant uuid := 'c0000000-0000-4000-8000-000000000017';
  seen integer; refused boolean;
begin
  insert into public.jobs (id, user_id, name) values (job, alice, 'Sync desk');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', alice::text, true);

  -- ---- a linked shift carries both halves of the link ------------------------
  insert into public.shifts (user_id, job_id, starts_at, ends_at, google_calendar_id, google_event_id)
    values (alice, job, '2030-01-07 14:00+00', '2030-01-07 18:00+00', 'primary', 'evt-1');

  refused := false;
  begin
    insert into public.shifts (user_id, job_id, starts_at, ends_at, google_event_id)
      values (alice, job, '2030-01-08 14:00+00', '2030-01-08 18:00+00', 'evt-half');
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'a shift was linked to an event with no calendar'; end if;
  refused := false;
  begin
    insert into public.shifts (user_id, job_id, starts_at, ends_at, google_calendar_id)
      values (alice, job, '2030-01-08 14:00+00', '2030-01-08 18:00+00', 'primary');
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'a shift was linked to a calendar with no event'; end if;
  refused := false;
  begin
    insert into public.shifts (user_id, job_id, starts_at, ends_at, google_adopted)
      values (alice, job, '2030-01-08 14:00+00', '2030-01-08 18:00+00', true);
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'an unlinked shift was marked adopted'; end if;

  -- ---- one event feeds one shift ---------------------------------------------
  refused := false;
  begin
    insert into public.shifts (user_id, job_id, starts_at, ends_at, google_calendar_id, google_event_id)
      values (alice, job, '2030-01-09 14:00+00', '2030-01-09 18:00+00', 'primary', 'evt-1');
  exception when unique_violation then refused := true;
  end;
  if not refused then raise exception 'two shifts were linked to the same Google event'; end if;

  insert into public.shifts (user_id, job_id, starts_at, ends_at, google_calendar_id, google_event_id)
    values (alice, job, '2030-01-09 14:00+00', '2030-01-09 18:00+00', 'work', 'evt-1');

  -- ---- per-job settings are bounded ------------------------------------------
  update public.jobs set google_keyword = 'Campus', google_calendar_id = 'work', google_sync = true where id = job;
  refused := false;
  begin
    update public.jobs set google_keyword = repeat('k', 81) where id = job;
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'an 81-character Google keyword was accepted'; end if;
  refused := false;
  begin
    update public.jobs set google_keyword = '   ' where id = job;
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'a blank Google keyword was accepted'; end if;
  refused := false;
  begin
    update public.jobs set google_calendar_id = repeat('c', 256) where id = job;
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'a 256-character calendar id was accepted'; end if;
  refused := false;
  begin
    update public.jobs set google_sync_ignored = array(select 'primary:e' || n from generate_series(1, 501) n) where id = job;
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'an ignore list of 501 events was accepted'; end if;

  -- ---- the issue list is an array, and short ---------------------------------
  insert into public.google_calendar_connections (user_id, google_email, refresh_token_ciphertext, scopes)
    values (alice, 'alice@gmail.com', 'v1:opaque', array['openid']);
  update public.google_calendar_connections set sync_issues = '[{"reason":"over your weekly limit"}]', shifts_synced_at = now() where user_id = alice;
  refused := false;
  begin
    update public.google_calendar_connections set sync_issues = '{"reason":"not an array"}' where user_id = alice;
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'sync_issues accepted a non-array'; end if;
  refused := false;
  begin
    update public.google_calendar_connections set sync_issues = (select jsonb_agg(jsonb_build_object('reason', n)) from generate_series(1, 21) n) where user_id = alice;
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'sync_issues accepted 21 entries'; end if;

  -- ---- linked shifts stay private --------------------------------------------
  perform set_config('request.jwt.claim.sub', bob::text, true);
  select count(*) into seen from public.shifts where google_event_id is not null;
  if seen <> 0 then raise exception 'Bob can see % of Alice''s linked shifts', seen; end if;
end;
$$;

reset role;
delete from public.google_calendar_connections where user_id = '11111111-1111-1111-1111-111111111111';
delete from public.shifts where job_id = 'c0000000-0000-4000-8000-000000000017';
delete from public.jobs where id = 'c0000000-0000-4000-8000-000000000017';

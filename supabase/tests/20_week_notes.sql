\set ON_ERROR_STOP on

-- Week notes are private to their owner, one per week, never blank or
-- oversized, and closed to a disabled account like every other table of
-- personal data. Alice owns them; Bob must not see or touch them. The disabled
-- case uses a throwaway account, so no shared fixture moves for later suites.

do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob constant uuid := '22222222-2222-2222-2222-222222222222';
  jade constant uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  seen integer; touched integer; refused boolean;
begin
  execute 'set local role authenticated';

  -- ---- the owner can create, read, update and delete her notes ----------------
  perform set_config('request.jwt.claim.sub', alice::text, true);
  insert into public.week_notes (user_id, week_start, body) values (alice, '2030-01-06', 'Asked for Friday off');
  select count(*) into seen from public.week_notes;
  if seen <> 1 then raise exception 'Alice sees % week notes, expected 1', seen; end if;
  update public.week_notes set body = 'Asked for Friday off. Approved.' where user_id = alice and week_start = '2030-01-06';
  get diagnostics touched = row_count;
  if touched <> 1 then raise exception 'Alice could not update her own week note'; end if;
  -- The upsert the app sends: same week, new text.
  insert into public.week_notes (user_id, week_start, body) values (alice, '2030-01-06', 'Paycheck short 2h')
    on conflict (user_id, week_start) do update set body = excluded.body;
  select count(*) into seen from public.week_notes where body = 'Paycheck short 2h';
  if seen <> 1 then raise exception 'the week-note upsert did not replace the text'; end if;

  -- ---- one note per week ------------------------------------------------------
  refused := false;
  begin
    insert into public.week_notes (user_id, week_start, body) values (alice, '2030-01-06', 'A second note');
  exception when unique_violation then refused := true;
  end;
  if not refused then raise exception 'two notes were saved for one week'; end if;

  -- ---- the body is bounded ----------------------------------------------------
  refused := false;
  begin
    insert into public.week_notes (user_id, week_start, body) values (alice, '2030-01-13', '   ');
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'a blank week note was accepted'; end if;
  refused := false;
  begin
    insert into public.week_notes (user_id, week_start, body) values (alice, '2030-01-13', repeat('n', 2001));
  exception when check_violation then refused := true;
  end;
  if not refused then raise exception 'a 2001-character week note was accepted'; end if;
  insert into public.week_notes (user_id, week_start, body) values (alice, '2030-01-13', repeat('n', 2000));

  -- ---- nobody can write a note for someone else -------------------------------
  refused := false;
  begin
    insert into public.week_notes (user_id, week_start, body) values (bob, '2030-01-06', 'Planted');
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'Alice inserted a week note for Bob'; end if;

  -- ---- another user sees and changes nothing ----------------------------------
  perform set_config('request.jwt.claim.sub', bob::text, true);
  select count(*) into seen from public.week_notes;
  if seen <> 0 then raise exception 'Bob can see % of Alice''s week notes', seen; end if;
  update public.week_notes set body = 'Bob was here' where user_id = alice;
  get diagnostics touched = row_count;
  if touched <> 0 then raise exception 'Bob updated Alice''s week note'; end if;
  delete from public.week_notes where user_id = alice;
  get diagnostics touched = row_count;
  if touched <> 0 then raise exception 'Bob deleted Alice''s week note'; end if;

  -- ---- clearing a note deletes it ---------------------------------------------
  perform set_config('request.jwt.claim.sub', alice::text, true);
  delete from public.week_notes where user_id = alice and week_start = '2030-01-13';
  get diagnostics touched = row_count;
  if touched <> 1 then raise exception 'Alice could not delete her own week note'; end if;

  -- ---- a disabled account is locked out ---------------------------------------
  execute 'set local role postgres';
  perform set_config('request.jwt.claim.sub', '', true);
  insert into auth.users (id, email) values (jade, 'jade@example.com');
  insert into public.week_notes (user_id, week_start, body) values (jade, '2030-01-06', 'Before the ban');
  update public.profiles set disabled_at = now() where id = jade;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', jade::text, true);
  select count(*) into seen from public.week_notes;
  if seen <> 0 then raise exception 'a disabled account can still read its week notes'; end if;
  update public.week_notes set body = 'After the ban' where user_id = jade;
  get diagnostics touched = row_count;
  if touched <> 0 then raise exception 'a disabled account can still update its week notes'; end if;
  delete from public.week_notes where user_id = jade;
  get diagnostics touched = row_count;
  if touched <> 0 then raise exception 'a disabled account can still delete its week notes'; end if;
  refused := false;
  begin
    insert into public.week_notes (user_id, week_start, body) values (jade, '2030-01-13', 'After the ban');
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'a disabled account can still create a week note'; end if;

  -- ---- the notes go with the profile ------------------------------------------
  execute 'set local role postgres';
  perform set_config('request.jwt.claim.sub', '', true);
  delete from public.profiles where id = jade;
  select count(*) into seen from public.week_notes where user_id = jade;
  if seen <> 0 then raise exception 'deleting a profile left its week notes behind'; end if;
  delete from auth.users where id = jade;

  -- ---- anon has no access at all ----------------------------------------------
  execute 'set local role anon';
  refused := false;
  begin
    perform 1 from public.week_notes;
  exception when insufficient_privilege then refused := true;
  end;
  if not refused then raise exception 'anon can select from week_notes'; end if;

  -- ---- updated_at moves on update ---------------------------------------------
  execute 'set local role postgres';
  update public.week_notes set updated_at = '2000-01-01' where user_id = alice;
  update public.week_notes set body = 'Moved on' where user_id = alice;
  if (select updated_at from public.week_notes where user_id = alice) < now() - interval '1 minute' then
    raise exception 'updated_at did not move on update';
  end if;
end;
$$;

-- Leave no week notes for any later suite.
reset role;
delete from public.week_notes;

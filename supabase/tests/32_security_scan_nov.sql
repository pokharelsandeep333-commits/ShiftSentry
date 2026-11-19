\set ON_ERROR_STOP on

-- Fixes from the 2026-11-18 security scan (20261118200000):
--   A. export_account_data() keeps its own budget of three exports a minute,
--      for callers that skip the download route; one transaction counts once.
--   B. A round the host cancelled is not revealed: no word, decoy, imposters
--      or other players' ballots. A finished round still reveals.
--   C. Renaming a seat to the name it already has writes and rings nothing.
--   D. Deleting an account removes its id from audit metadata as well as from
--      the actor and target columns.
-- The runner clears account_export_claims before each suite, so the earlier
-- suites' exports do not count here.

insert into auth.users(id, email) values
  ('7a000000-0000-4000-8000-000000000001', 'export-budget@example.com'),
  ('7a000000-0000-4000-8000-000000000002', 'audit-subject@example.com');

-- ---- A. export budget: each DO block below is its own transaction -----------
do $$
declare
  me constant uuid := '7a000000-0000-4000-8000-000000000001';
  seen integer; refused boolean;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', me::text, true);
  perform public.export_account_data();
  perform public.export_account_data();
  perform public.export_account_data();
  perform public.export_account_data();

  refused := false;
  begin select count(*) into seen from public.account_export_claims; exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception 'an API role can read the export budget'; end if;
  refused := false;
  begin delete from public.account_export_claims; exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception 'an API role can reset the export budget'; end if;
  raise notice 'export: four calls in one transaction count once; the budget table is closed to API roles';
end $$;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '7a000000-0000-4000-8000-000000000001', true);
  perform public.export_account_data();
end $$;

do $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '7a000000-0000-4000-8000-000000000001', true);
  perform public.export_account_data();
end $$;

do $$
declare refused boolean := false;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '7a000000-0000-4000-8000-000000000001', true);
  begin
    perform public.export_account_data();
  exception when sqlstate 'PT429' then refused := true;
  end;
  if not refused then raise exception 'a fourth export in one minute was allowed'; end if;

  -- Another account has its own budget.
  perform set_config('request.jwt.claim.sub', '7a000000-0000-4000-8000-000000000002', true);
  perform public.export_account_data();
  raise notice 'export: the fourth transaction in a minute is refused with PT429; other accounts unaffected';
end $$;

-- The minute passes.
update public.account_export_claims set window_started_at = now() - interval '61 seconds'
 where user_id = '7a000000-0000-4000-8000-000000000001';

do $$
declare exported jsonb;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '7a000000-0000-4000-8000-000000000001', true);
  exported := public.export_account_data();
  if exported->'profile'->>'email' <> 'export-budget@example.com' then raise exception 'the export after the window was incomplete'; end if;
  raise notice 'export: a new minute brings the budget back, and the export is complete';
end $$;

-- ---- B. a cancelled round stays secret; a finished one reveals --------------
do $$
declare
  deal record;
  host constant uuid := '11111111-1111-1111-1111-111111111111';
  imposter uuid; voter uuid; observer uuid; next_round uuid;
  seen integer; phase text;
begin
  select * into deal from test_deal('NONE', false, false, 1, 1, 4);
  imposter := deal.imposter_ids[1];
  perform test_all_clues(deal.round_id);

  execute 'set local role postgres';
  select status::text into phase from public.game_rounds where id = deal.round_id;
  if phase <> 'VOTING' then raise exception 'setup: round is % rather than VOTING', phase; end if;
  select user_id into voter from public.game_round_players where round_id = deal.round_id and user_id not in (imposter, host) limit 1;
  select user_id into observer from public.game_round_players where round_id = deal.round_id and user_id not in (imposter, host, voter) limit 1;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', voter::text, true);
  perform public.submit_game_vote(deal.round_id, imposter);

  perform set_config('request.jwt.claim.sub', host::text, true);
  perform public.abandon_game_round(deal.round_id);

  perform set_config('request.jwt.claim.sub', observer::text, true);
  select count(*) into seen from public.game_round_reveal(deal.round_id);
  if seen <> 0 then raise exception 'LEAK: a cancelled round revealed its word and imposters'; end if;
  select count(*) into seen from public.game_votes where round_id = deal.round_id;
  if seen <> 0 then raise exception 'LEAK: a cancelled round showed another player % ballot(s)', seen; end if;
  perform set_config('request.jwt.claim.sub', voter::text, true);
  select count(*) into seen from public.game_votes where round_id = deal.round_id;
  if seen <> 1 then raise exception 'a voter lost sight of their own ballot (%)', seen; end if;
  raise notice 'a cancelled round reveals nothing and hides others'' ballots; your own ballot stays yours';

  -- The next round in the same room is played out: everyone votes the
  -- imposter (who votes someone else), so the crew win and it reveals.
  perform set_config('request.jwt.claim.sub', host::text, true);
  next_round := public.start_game_round(deal.room_id);
  perform test_all_clues(next_round);
  execute 'set local role postgres';
  select array_agg(secret.user_id) into deal.imposter_ids from public.game_round_secrets secret where secret.round_id = next_round and secret.role = 'IMPOSTER';
  imposter := deal.imposter_ids[1];
  execute 'set local role authenticated';
  for voter in select user_id from public.game_round_players where round_id = next_round order by user_id loop
    perform set_config('request.jwt.claim.sub', voter::text, true);
    if voter = imposter then
      perform public.submit_game_vote(next_round, (select user_id from public.game_round_players where round_id = next_round and user_id <> imposter order by user_id limit 1));
    else
      perform public.submit_game_vote(next_round, imposter);
    end if;
  end loop;

  execute 'set local role postgres';
  select status::text into phase from public.game_rounds where id = next_round;
  if phase <> 'REVEAL' then raise exception 'setup: finished round is % rather than REVEAL', phase; end if;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', observer::text, true);
  select count(*) into seen from public.game_round_reveal(next_round);
  if seen <> 1 then raise exception 'a finished round no longer reveals'; end if;
  select count(*) into seen from public.game_votes where round_id = next_round;
  if seen <> 4 then raise exception 'a finished round shows % of 4 ballots', seen; end if;
  raise notice 'a finished round still reveals its word, imposters and every ballot';

  -- ---- C. an unchanged name rings nothing ------------------------------------
  execute 'set local role postgres';
  delete from realtime.messages where topic = 'game:' || deal.room_id::text;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', observer::text, true);
  perform public.rename_game_player(deal.room_id, 'Same Name');
  execute 'set local role postgres';
  select count(*) into seen from realtime.messages where topic = 'game:' || deal.room_id::text;
  if seen <> 1 then raise exception 'a real rename rang the room % times', seen; end if;
  delete from realtime.messages where topic = 'game:' || deal.room_id::text;
  execute 'set local role authenticated';
  perform public.rename_game_player(deal.room_id, '  Same Name ');
  perform public.rename_game_player(deal.room_id, 'Same Name');
  execute 'set local role postgres';
  select count(*) into seen from realtime.messages where topic = 'game:' || deal.room_id::text;
  if seen <> 0 then raise exception 'an unchanged name rang the room % times', seen; end if;
  raise notice 'renaming to the same name writes and broadcasts nothing; a real rename still rings once';
end $$;

-- ---- D. deletion clears an id kept only in audit metadata --------------------
do $$
declare
  admin_id constant uuid := '11111111-1111-1111-1111-111111111111';
  subject constant uuid := '7a000000-0000-4000-8000-000000000002';
begin
  insert into public.audit_events(actor_id, action, metadata)
    values (admin_id, 'audit.exported', jsonb_build_object('rows', 3, 'actor', subject::text));
  delete from auth.users where id = subject;
  if exists (select 1 from public.audit_events where metadata::text like '%' || subject::text || '%') then
    raise exception 'a deleted account''s id survived in audit metadata';
  end if;
  if not exists (select 1 from public.audit_events where actor_id = admin_id and action = 'audit.exported' and metadata ? 'rows') then
    raise exception 'the cleanup wiped the rest of another admin''s audit entry';
  end if;
  raise notice 'deletion removes an id kept only in audit metadata, and keeps the rest of the entry';
end $$;

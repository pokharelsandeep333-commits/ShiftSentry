\set ON_ERROR_STOP on

-- An ended room stays ended, and a disabled host loses it.
--
-- Pins 20260930120000. Ending a room used to leave its round live, and
-- abandon_game_round / finish_game_round checked only host_id before moving
-- the room back to LOBBY -- so a host could reopen a room after ending it, and
-- a disabled host, whose seats are gone but whose host_id was not, could do the
-- same with a token issued before the ban.
--
-- Alice is disabled in the last block and re-enabled at the end; every seat she
-- held is gone, as in 14.

create temp table ended_fixture (room_id uuid, round_id uuid);

-- ---- ending a room ends its round, and nothing reopens it -------------------
do $$
declare
  deal record;
  host constant uuid := '11111111-1111-1111-1111-111111111111';
  phase text; room_phase text; marked timestamptz; refused boolean;
begin
  select * into deal from test_deal('NONE', false, true, 1, 2, 4);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', host::text, true);
  perform public.end_game_room(deal.room_id);

  execute 'set local role postgres';
  select status::text, abandoned_at into phase, marked from public.game_rounds where id = deal.round_id;
  if phase <> 'ENDED' then raise exception 'ending the room left its round %', phase; end if;
  if marked is null then raise exception 'the round the room ended was not marked abandoned'; end if;
  raise notice 'ending the room ends its round, marked abandoned';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', host::text, true);
  refused := false;
  begin
    perform public.abandon_game_round(deal.round_id);
  exception when sqlstate 'P0001' then
    if sqlerrm !~ 'already over' then raise; end if;
    refused := true;
  end;
  if not refused then raise exception 'the host abandoned a round of an ended room'; end if;

  execute 'set local role postgres';
  select status::text into room_phase from public.game_rooms where id = deal.room_id;
  if room_phase <> 'ENDED' then raise exception 'the ended room was reopened to %', room_phase; end if;
  raise notice 'the host cannot reopen an ended room';
end;
$$;

-- ---- a round left live under an ended room still cannot reopen it -----------
-- The trigger means this state cannot arise any more; it is built by hand,
-- with the trigger off, so the functions' own checks are what is tested.
do $$
declare
  deal record;
  host constant uuid := '11111111-1111-1111-1111-111111111111';
  room_phase text; refused boolean;
begin
  select * into deal from test_deal('NONE', false, true, 1, 2, 4);

  execute 'set local role postgres';
  alter table public.game_rooms disable trigger game_rooms_ended_close_rounds;
  update public.game_rooms set status = 'ENDED', ended_at = now() where id = deal.room_id;
  alter table public.game_rooms enable trigger game_rooms_ended_close_rounds;
  insert into ended_fixture values (deal.room_id, deal.round_id);

  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', host::text, true);
  refused := false;
  begin
    perform public.abandon_game_round(deal.round_id);
  exception when sqlstate 'P0001' then refused := true;
  end;
  if not refused then raise exception 'abandon_game_round reopened an ended room'; end if;
  refused := false;
  begin
    perform public.finish_game_round(deal.round_id);
  exception when sqlstate 'P0001' then refused := true;
  end;
  if not refused then raise exception 'finish_game_round reopened an ended room'; end if;

  execute 'set local role postgres';
  select status::text into room_phase from public.game_rooms where id = deal.room_id;
  if room_phase <> 'ENDED' then raise exception 'the ended room was reopened to %', room_phase; end if;
  raise notice 'a live round under an ended room does not reopen it';
end;
$$;

-- ---- a disabled former host keeps nothing -----------------------------------
do $$
declare
  fixture record;
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  host_now uuid; room_phase text; seen integer; refused boolean;
begin
  select * into fixture from ended_fixture;

  -- Disabled the way setAccountDisabled does it (see 14).
  execute 'set local role postgres';
  perform set_config('request.jwt.claim.sub', '', true);
  update public.profiles set disabled_at = now() where id = alice;
  select host_id into host_now from public.game_rooms where id = fixture.room_id;
  if host_now <> alice then raise exception 'fixture: the ended room is hosted by %, not Alice', host_now; end if;

  -- Her token still reaches PostgREST.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', alice::text, true);
  refused := false;
  begin
    perform public.abandon_game_round(fixture.round_id);
  exception when sqlstate 'P0001' then
    if sqlerrm !~ 'Only the host' then raise; end if;
    refused := true;
  end;
  if not refused then raise exception 'LEAK: a disabled former host abandoned a round'; end if;
  refused := false;
  begin
    perform public.finish_game_round(fixture.round_id);
  exception when sqlstate 'P0001' then
    if sqlerrm !~ 'Only the host' then raise; end if;
    refused := true;
  end;
  if not refused then raise exception 'LEAK: a disabled former host finished a round'; end if;

  select count(*) into seen from public.game_rooms where id = fixture.room_id;
  if seen <> 0 then raise exception 'LEAK: a disabled former host can still read the room'; end if;

  execute 'set local role postgres';
  select status::text into room_phase from public.game_rooms where id = fixture.room_id;
  if room_phase <> 'ENDED' then raise exception 'LEAK: the room was reopened to %', room_phase; end if;
  raise notice 'a disabled former host can neither reopen nor read the room';

  -- Enabled again: the host exception reads her ended room as before.
  perform set_config('request.jwt.claim.sub', '', true);
  update public.profiles set disabled_at = null where id = alice;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', alice::text, true);
  select count(*) into seen from public.game_rooms where id = fixture.room_id;
  if seen <> 1 then raise exception 'an enabled host can no longer read the room she hosted'; end if;
  raise notice 're-enabled: the room she hosted is readable again';
end;
$$;

drop table ended_fixture;

-- Fixtures the round suites share. Test-only: they live in a throwaway
-- database that is created and destroyed by scripts/run-sql-tests.sh, and are
-- never part of a migration.

-- Test-only helper: seats `p_seats` players, applies the settings, and deals.
-- Not SECURITY DEFINER -- it switches role itself so the game functions see the
-- right auth.uid() at each step.
create or replace function test_deal(
  p_decoy boolean, p_hint boolean, p_guess boolean,
  p_imposters integer, p_passes integer, p_seats integer
)
returns table (room_id uuid, round_id uuid, imposter_ids uuid[])
language plpgsql
as $$
declare
  everyone constant uuid[] := array[
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333',
    '44444444-4444-4444-4444-444444444444',
    '55555555-5555-5555-5555-555555555555'
  ];
  host constant uuid := everyone[1];
  who uuid;
  new_code text;
  rm uuid;
  rd uuid;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub', host::text, true);
  new_code := public.create_game_room('Host');

  execute 'set local role postgres';
  select id into rm from public.game_rooms where game_rooms.code = new_code;
  execute 'set local role authenticated';

  foreach who in array everyone[2:p_seats] loop
    perform set_config('request.jwt.claim.sub', who::text, true);
    perform public.join_game_room(new_code, null);
  end loop;

  perform set_config('request.jwt.claim.sub', host::text, true);
  perform public.update_game_room_settings(rm, p_decoy, p_hint, p_guess, p_imposters, p_passes, 20, null);
  rd := public.start_game_round(rm);

  execute 'set local role postgres';
  return query
    select rm, rd, array(
      select s.user_id from public.game_round_secrets s where s.round_id = rd and s.role = 'IMPOSTER'
    );
end;
$$;

-- Test-only helper: play out every clue in every pass.
create or replace function test_all_clues(p_round uuid)
returns integer
language plpgsql
as $$
declare
  host constant uuid := '11111111-1111-1111-1111-111111111111';
  turn uuid;
  given integer := 0;
begin
  execute 'set local role authenticated';
  loop
    perform set_config('request.jwt.claim.sub', host::text, true);
    turn := public.game_round_turn(p_round);
    exit when turn is null;
    perform set_config('request.jwt.claim.sub', turn::text, true);
    perform public.submit_game_clue(p_round, 'clue');
    given := given + 1;
  end loop;
  execute 'set local role postgres';
  return given;
end;
$$;

\set ON_ERROR_STOP on

-- get_session_context (20261119120000): one call returns the caller's own
-- profile and has_current_legal_acceptance(). It must never return anyone
-- else's row, must agree with the agreement check, and is closed to anon.

do $$
declare
  alice constant uuid := '11111111-1111-1111-1111-111111111111';
  bob constant uuid := '22222222-2222-2222-2222-222222222222';
  context jsonb; refused boolean;
begin
  set local role authenticated;

  perform set_config('request.jwt.claim.sub', alice::text, true);
  context := public.get_session_context();
  if (context->'profile'->>'id')::uuid is distinct from alice then raise exception 'context returned another profile: %', context->'profile'->>'id'; end if;
  if (context->>'accepted')::boolean is distinct from public.has_current_legal_acceptance() then raise exception 'context disagrees with the agreement check'; end if;
  if (context->>'accepted')::boolean is not true then raise exception 'the seeded user should hold the current agreement'; end if;

  perform set_config('request.jwt.claim.sub', bob::text, true);
  context := public.get_session_context();
  if (context->'profile'->>'id')::uuid is distinct from bob then raise exception 'context for bob returned %', context->'profile'->>'id'; end if;
  if context->'profile' ? 'refresh_token_ciphertext' then raise exception 'context leaked a column it should not carry'; end if;

  -- A token for an account with no profile gets no profile, and no agreement.
  perform set_config('request.jwt.claim.sub', '7b000000-0000-4000-8000-000000000099', true);
  context := public.get_session_context();
  if jsonb_typeof(context->'profile') <> 'null' then raise exception 'a profile appeared for an unknown user'; end if;
  if (context->>'accepted')::boolean then raise exception 'an unknown user counted as accepted'; end if;
  raise notice 'context: own profile only, agrees with the agreement check, nothing for an unknown user';

  set local role anon;
  refused := false;
  begin perform public.get_session_context(); exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception 'anon can call get_session_context'; end if;
  raise notice 'context: closed to anon';
end $$;

-- A disabled account is not "accepted", as with the existing check.
do $$
declare context jsonb;
begin
  insert into auth.users(id, email) values ('7b000000-0000-4000-8000-000000000001', 'context-disabled@example.com');
  insert into public.legal_acceptances(user_id, version)
    select '7b000000-0000-4000-8000-000000000001', version from public.legal_versions order by published_at desc, version desc limit 1;
  update public.profiles set disabled_at = now() where id = '7b000000-0000-4000-8000-000000000001';
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', '7b000000-0000-4000-8000-000000000001', true);
  context := public.get_session_context();
  if (context->>'accepted')::boolean then raise exception 'a disabled account counted as accepted'; end if;
  if context->'profile'->>'disabled_at' is null then raise exception 'the disabled flag did not come back'; end if;
  raise notice 'context: a disabled account is not accepted and its flag is returned';
end $$;

-- The round: deal roles, take clues in turn, vote, reveal.
--
-- Phase 1 built the secrecy boundary and phase 2 the lobby; this is the part
-- that actually plays. Four rules are worth stating before the code, because
-- each one is a decision rather than an implementation detail.
--
--   A round is one clue phase, one vote, one elimination. The crew wins if the
--   vote lands on any imposter -- with two or three imposters they do not have
--   to find them all. The honest alternative is repeated vote rounds until every
--   imposter is out or the crew is outnumbered, which needs elimination order,
--   revotes, and a much larger state machine. This rule is simple, it is a real
--   house rule, and the reveal names every imposter afterwards so nobody is left
--   wondering.
--
--   A tie eliminates nobody and the imposters win. Somebody has to lose a tie,
--   and the crew are the ones who failed to agree.
--
--   Votes are secret until the reveal. Phase 1 let any room member select
--   game_votes, which during a live vote means reading everyone's ballot out of
--   the network tab. The policy below replaces it: you see your own vote, and
--   everyone's once the round is over. The lobby still needs to show who has
--   voted, so `game_round_voters` returns the voters without their targets --
--   the fact that you have voted is public, the choice is not.
--
--   A player who leaves mid-round stops blocking it. Their seat stays in the
--   round so the reveal still makes sense, but the turn order steps over them
--   and the vote no longer waits for them. Without this one closed tab stalls
--   the game permanently, with no way for the host to move it on.

-- 'GUESSING' is added by 20260907135000, which must be a separate migration:
-- the policy below names it, and Postgres refuses to use a new enum value in the
-- transaction that created it.
alter table public.game_rounds
  add column caught_user_id uuid references public.profiles(id) on delete set null,
  add column final_guess text check (char_length(final_guess) <= 40),
  add column outcome text check (outcome in ('CREW_WIN', 'IMPOSTER_WIN'));

-- The category shown to an imposter when the host turned the hint on.
--
-- Stored on the secret row rather than read from game_words at render time,
-- because game_words is unreachable to `authenticated` by design -- and because
-- a hint, like the word itself, is per-player: the crew never sees this column
-- populated, so there is no path by which it tells them anything.
alter table public.game_round_secrets
  add column category_hint_text text check (char_length(category_hint_text) between 2 and 40);

grant select (
  id, room_id, round_no, status, decoy_mode, category_hint, imposter_final_guess,
  imposter_count, clue_passes, current_pass, started_at, ended_at,
  caught_user_id, final_guess, outcome
) on public.game_rounds to authenticated;

drop policy if exists "members read votes" on public.game_votes;

create policy "votes stay secret until the reveal" on public.game_votes
  for select using (
    (select auth.uid()) = voter_id
    or exists (
      select 1
      from public.game_rounds
      where game_rounds.id = game_votes.round_id
        and game_rounds.status in ('GUESSING', 'REVEAL', 'ENDED')
        and public.is_game_room_member(game_rounds.room_id)
    )
  );

-- Deal a round.
--
-- Seating and role assignment are both `order by random()` over the roster, in
-- one statement each, so neither the turn order nor the imposter can be inferred
-- from join order -- the host, who is always the first row in game_room_players,
-- would otherwise be predictable.
create or replace function public.start_game_round(p_room_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  room record;
  seated integer;
  next_number integer;
  new_round uuid;
  drawn_id bigint;
  secret record;
begin
  if actor is null then
    raise exception 'You must be signed in.';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_room_id::text));

  select id, status, decoy_mode, category_hint, imposter_final_guess, imposter_count, clue_passes
    into room
    from public.game_rooms
    where id = p_room_id
      and host_id = actor
      and status = 'LOBBY';

  if not found then
    raise exception 'Only the host can start a round, and only from the lobby.';
  end if;

  select count(*) into seated from public.game_room_players where room_id = p_room_id;

  if seated < 3 then
    raise exception 'A round needs at least 3 players.';
  end if;

  if room.imposter_count > seated - 2 then
    raise exception '% imposters needs at least % players.', room.imposter_count, room.imposter_count + 2;
  end if;

  drawn_id := public.draw_game_word(p_room_id);

  select coalesce(max(round_no), 0) + 1 into next_number
    from public.game_rounds where room_id = p_room_id;

  insert into public.game_rounds (
    room_id, round_no, word_id, status,
    decoy_mode, category_hint, imposter_final_guess, imposter_count, clue_passes
  )
  values (
    p_room_id, next_number, drawn_id, 'CLUES',
    room.decoy_mode, room.category_hint, room.imposter_final_guess, room.imposter_count, room.clue_passes
  )
  returning id into new_round;

  insert into public.game_round_players (round_id, user_id, turn_order)
  select new_round, user_id, row_number() over (order by random())
    from public.game_room_players
    where room_id = p_room_id;

  select word, decoy_word, category into secret
    from public.game_words where id = drawn_id;

  -- One statement so `chosen` is evaluated once: referenced twice, a re-run of
  -- `order by random()` would pick a different set for the join than for the
  -- membership test and could leave the round with no imposter at all.
  with chosen as (
    select user_id
      from public.game_round_players
      where round_id = new_round
      order by random()
      limit room.imposter_count
  )
  insert into public.game_round_secrets (round_id, user_id, role, assigned_word, category_hint_text)
  select
    new_round,
    seat.user_id,
    case when chosen.user_id is null then 'CREW' else 'IMPOSTER' end::public.game_player_role,
    case
      when chosen.user_id is null then secret.word
      when room.decoy_mode then secret.decoy_word
      else null
    end,
    case when chosen.user_id is not null and room.category_hint then secret.category else null end
  from public.game_round_players seat
  left join chosen on chosen.user_id = seat.user_id
  where seat.round_id = new_round;

  update public.game_rooms set status = 'PLAYING' where id = p_room_id;

  return new_round;
end;
$$;

comment on function public.start_game_round(uuid) is
  'Host-only. Draws a word, seats the roster in random turn order, assigns imposters, and moves the room into play.';

-- Whose turn it is: the lowest-seated player still in the room who has not given
-- a clue this pass. Returns null when the pass is complete.
create or replace function public.game_round_turn(p_round_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select seat.user_id
  from public.game_round_players seat
  join public.game_rounds round on round.id = seat.round_id
  where seat.round_id = p_round_id
    and public.is_game_room_member(round.room_id)
    and seat.eliminated_at is null
    and exists (
      select 1 from public.game_room_players member
      where member.room_id = round.room_id and member.user_id = seat.user_id
    )
    and not exists (
      select 1 from public.game_clues clue
      where clue.round_id = p_round_id
        and clue.user_id = seat.user_id
        and clue.pass_no = round.current_pass
    )
  order by seat.turn_order
  limit 1;
$$;

comment on function public.game_round_turn(uuid) is
  'The player who owes a clue this pass, skipping anyone who has left the room. Null when the pass is done.';

create or replace function public.submit_game_clue(p_round_id uuid, p_clue text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  round record;
  cleaned text := btrim(p_clue);
begin
  if actor is null then
    raise exception 'You must be signed in.';
  end if;

  if char_length(cleaned) < 1 or char_length(cleaned) > 40 then
    raise exception 'A clue is one to forty characters.';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_round_id::text));

  select id, room_id, status, current_pass, clue_passes
    into round
    from public.game_rounds
    where id = p_round_id;

  if not found or round.status <> 'CLUES' then
    raise exception 'This round is not taking clues.';
  end if;

  if public.game_round_turn(p_round_id) is distinct from actor then
    raise exception 'It is not your turn yet.';
  end if;

  insert into public.game_clues (round_id, user_id, pass_no, clue)
  values (p_round_id, actor, round.current_pass, cleaned);

  -- The pass is over when nobody is left owing a clue.
  if public.game_round_turn(p_round_id) is null then
    if round.current_pass < round.clue_passes then
      update public.game_rounds set current_pass = current_pass + 1 where id = p_round_id;
    else
      update public.game_rounds set status = 'VOTING' where id = p_round_id;
    end if;
  end if;
end;
$$;

comment on function public.submit_game_clue(uuid, text) is
  'Records the caller''s clue for the current pass and advances the pass or the phase when it completes.';

-- Resolve the vote. Internal: called only once every active player has voted.
create or replace function public.resolve_game_round(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  leaders uuid[];
  eliminated uuid;
  eliminated_role public.game_player_role;
  allows_guess boolean;
begin
  select imposter_final_guess into allows_guess
    from public.game_rounds where id = p_round_id;

  with tally as (
    select target_id, count(*) as votes
      from public.game_votes
      where round_id = p_round_id
      group by target_id
  )
  select array_agg(target_id) into leaders
    from tally
    where votes = (select max(votes) from tally);

  -- A tie eliminates nobody, and nobody is exactly who the crew agreed on.
  if leaders is null or array_length(leaders, 1) <> 1 then
    update public.game_rounds
       set status = 'REVEAL', outcome = 'IMPOSTER_WIN', ended_at = now()
     where id = p_round_id;
    return;
  end if;

  eliminated := leaders[1];

  update public.game_round_players
     set eliminated_at = now()
   where round_id = p_round_id and user_id = eliminated;

  select role into eliminated_role
    from public.game_round_secrets
    where round_id = p_round_id and user_id = eliminated;

  if eliminated_role <> 'IMPOSTER' then
    update public.game_rounds
       set status = 'REVEAL', outcome = 'IMPOSTER_WIN', caught_user_id = eliminated, ended_at = now()
     where id = p_round_id;
    return;
  end if;

  if allows_guess then
    -- Caught, but not beaten yet: naming the word still steals the round.
    update public.game_rounds
       set status = 'GUESSING', caught_user_id = eliminated
     where id = p_round_id;
  else
    update public.game_rounds
       set status = 'REVEAL', outcome = 'CREW_WIN', caught_user_id = eliminated, ended_at = now()
     where id = p_round_id;
  end if;
end;
$$;

create or replace function public.submit_game_vote(p_round_id uuid, p_target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  round record;
  active integer;
  cast_votes integer;
begin
  if actor is null then
    raise exception 'You must be signed in.';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_round_id::text));

  select id, room_id, status into round
    from public.game_rounds where id = p_round_id;

  if not found or round.status <> 'VOTING' then
    raise exception 'This round is not taking votes.';
  end if;

  if not exists (
    select 1 from public.game_round_players
    where round_id = p_round_id and user_id = actor and eliminated_at is null
  ) then
    raise exception 'You are not voting in this round.';
  end if;

  if not exists (
    select 1 from public.game_round_players
    where round_id = p_round_id and user_id = p_target_id and eliminated_at is null
  ) then
    raise exception 'That player is not in this round.';
  end if;

  if p_target_id = actor then
    raise exception 'You cannot vote for yourself.';
  end if;

  -- Changing your mind is allowed right up until the last ballot lands, which
  -- is the moment the round resolves below.
  insert into public.game_votes (round_id, voter_id, target_id)
  values (p_round_id, actor, p_target_id)
  on conflict (round_id, voter_id) do update set target_id = excluded.target_id, created_at = now();

  select count(*) into active
    from public.game_round_players seat
    where seat.round_id = p_round_id
      and seat.eliminated_at is null
      and exists (
        select 1 from public.game_room_players member
        where member.room_id = round.room_id and member.user_id = seat.user_id
      );

  select count(*) into cast_votes
    from public.game_votes where round_id = p_round_id;

  if cast_votes >= active then
    perform public.resolve_game_round(p_round_id);
  end if;
end;
$$;

comment on function public.submit_game_vote(uuid, uuid) is
  'Casts or changes the caller''s vote, resolving the round once every active player has voted.';

create or replace function public.submit_game_final_guess(p_round_id uuid, p_guess text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  round record;
  answer text;
  cleaned text := btrim(p_guess);
begin
  if actor is null then
    raise exception 'You must be signed in.';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_round_id::text));

  select id, status, caught_user_id, word_id into round
    from public.game_rounds where id = p_round_id;

  if not found or round.status <> 'GUESSING' then
    raise exception 'This round is not waiting for a guess.';
  end if;

  if round.caught_user_id is distinct from actor then
    raise exception 'Only the caught imposter can guess.';
  end if;

  if char_length(cleaned) < 1 or char_length(cleaned) > 40 then
    raise exception 'Enter the word you think it was.';
  end if;

  select word into answer from public.game_words where id = round.word_id;

  update public.game_rounds
     set status = 'REVEAL',
         final_guess = cleaned,
         outcome = case when lower(cleaned) = lower(answer) then 'IMPOSTER_WIN' else 'CREW_WIN' end,
         ended_at = now()
   where id = p_round_id;
end;
$$;

comment on function public.submit_game_final_guess(uuid, text) is
  'The caught imposter''s last chance. Matches case-insensitively against the round''s word.';

-- Who has voted, without what they voted for.
--
-- The vote policy hides targets until the reveal, which also hides the fact that
-- a ballot exists at all -- and the voting screen has to show who everyone is
-- still waiting on. This returns the voters only.
create or replace function public.game_round_voters(p_round_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select game_votes.voter_id
  from public.game_votes
  join public.game_rounds on game_rounds.id = game_votes.round_id
  where game_votes.round_id = p_round_id
    and public.is_game_room_member(game_rounds.room_id);
$$;

-- The answer, released only once the round is over.
--
-- This is the single path by which the word reaches a client, and the status
-- check is the whole reason it can exist: before REVEAL it returns nothing, so
-- calling it early tells you no more than not calling it.
create or replace function public.game_round_reveal(p_round_id uuid)
returns table (word text, decoy_word text, category text, imposter_ids uuid[])
language sql
stable
security definer
set search_path = ''
as $$
  select
    game_words.word,
    game_words.decoy_word,
    game_words.category,
    array(
      select user_id from public.game_round_secrets
      where round_id = p_round_id and role = 'IMPOSTER'
    )
  from public.game_rounds
  join public.game_words on game_words.id = game_rounds.word_id
  where game_rounds.id = p_round_id
    and game_rounds.status in ('REVEAL', 'ENDED')
    and public.is_game_room_member(game_rounds.room_id);
$$;

comment on function public.game_round_reveal(uuid) is
  'The round''s word, decoy, category and imposters. Returns nothing until the round reaches REVEAL.';

-- Close the round and return the room to the lobby so it can play again.
create or replace function public.finish_game_round(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  round record;
begin
  select game_rounds.id, game_rounds.room_id, game_rounds.status
    into round
    from public.game_rounds
    join public.game_rooms on game_rooms.id = game_rounds.room_id
    where game_rounds.id = p_round_id
      and game_rooms.host_id = actor;

  if not found then
    raise exception 'Only the host can close this round.';
  end if;

  if round.status <> 'REVEAL' then
    raise exception 'This round is still being played.';
  end if;

  update public.game_rounds
     set status = 'ENDED', ended_at = coalesce(ended_at, now())
   where id = p_round_id;

  update public.game_rooms set status = 'LOBBY' where id = round.room_id;
end;
$$;

comment on function public.finish_game_round(uuid) is
  'Host-only. Closes a revealed round and returns the room to the lobby.';

revoke execute on function public.resolve_game_round(uuid) from public, anon, authenticated;

revoke execute on function public.start_game_round(uuid) from public, anon;
revoke execute on function public.game_round_turn(uuid) from public, anon;
revoke execute on function public.submit_game_clue(uuid, text) from public, anon;
revoke execute on function public.submit_game_vote(uuid, uuid) from public, anon;
revoke execute on function public.submit_game_final_guess(uuid, text) from public, anon;
revoke execute on function public.game_round_voters(uuid) from public, anon;
revoke execute on function public.game_round_reveal(uuid) from public, anon;
revoke execute on function public.finish_game_round(uuid) from public, anon;

grant execute on function public.start_game_round(uuid) to authenticated;
grant execute on function public.game_round_turn(uuid) to authenticated;
grant execute on function public.submit_game_clue(uuid, text) to authenticated;
grant execute on function public.submit_game_vote(uuid, uuid) to authenticated;
grant execute on function public.submit_game_final_guess(uuid, text) to authenticated;
grant execute on function public.game_round_voters(uuid) to authenticated;
grant execute on function public.game_round_reveal(uuid) to authenticated;
grant execute on function public.finish_game_round(uuid) to authenticated;

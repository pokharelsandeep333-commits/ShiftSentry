-- A tied vote now extends the round instead of ending it.
--
-- Until now a tie handed the round straight to the imposters, on the reasoning
-- that somebody has to lose a tie and the crew are the ones who failed to agree.
-- That reads as a technicality rather than a rule, and it fires often: with four
-- players and one imposter a 2-2 split is common, and so is 1-1-1-1. Losing that
-- way is the least satisfying outcome in the game.
--
-- So a tie sends the round back for one more clue each, and the table votes
-- again. Nobody is eliminated, everybody is still in, and the extra pass is
-- exactly the information the room was missing when it deadlocked.
--
-- Three things make that work:
--
--   Votes are cleared. The unique constraint is one ballot per player per round,
--   so the old ones have to go for anyone to vote again. That means the reveal
--   shows the vote that decided it rather than every vote ever cast, which is
--   also what people mean when they ask who voted for whom.
--
--   `current_pass` goes past `clue_passes`, which is what ends the extra pass in
--   the right place. `submit_game_clue` moves to the vote when the finished pass
--   is not below the configured count -- so a round configured for one pass, now
--   on pass two, votes again the moment that pass completes. No special case.
--
--   It is capped. Two tiebreaks, then a tie resolves the old way. Without a cap
--   a table that keeps splitting evenly never finishes, and `ban_repeat_clues`
--   makes each extra pass harder than the last since every clue already said is
--   refused -- which is good pressure, and also a reason not to allow many.

alter table public.game_rounds
  add column tiebreak_count integer not null default 0
  check (tiebreak_count between 0 and 2);

grant select (
  id, room_id, round_no, status, decoy_mode, category_hint, imposter_final_guess,
  imposter_count, clue_passes, current_pass, started_at, ended_at,
  caught_user_id, final_guess, outcome,
  imposter_hint, hide_roles, ban_repeat_clues, discussion_phase,
  tiebreak_count
) on public.game_rounds to authenticated;

create or replace function public.resolve_game_round(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Named rather than inline: the cap is a game rule, and the check constraint
  -- on tiebreak_count has to agree with it.
  max_tiebreaks constant integer := 2;
  settings record;
  leaders uuid[];
  eliminated uuid;
  eliminated_role public.game_player_role;
begin
  select imposter_final_guess, tiebreak_count
    into settings
    from public.game_rounds
    where id = p_round_id;

  with tally as (
    select target_id, count(*) as votes
      from public.game_votes
      where round_id = p_round_id
      group by target_id
  )
  select array_agg(target_id) into leaders
    from tally
    where votes = (select max(votes) from tally);

  if leaders is null or array_length(leaders, 1) <> 1 then
    if settings.tiebreak_count < max_tiebreaks then
      -- Deadlocked, but not decided. One more clue each, then vote again.
      delete from public.game_votes where round_id = p_round_id;

      update public.game_rounds
         set status = 'CLUES',
             current_pass = current_pass + 1,
             tiebreak_count = tiebreak_count + 1
       where id = p_round_id;

      return;
    end if;

    -- Out of tiebreaks. Somebody has to lose one, and it is the side that could
    -- not agree twice over.
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

  if settings.imposter_final_guess then
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

comment on function public.resolve_game_round(uuid) is
  'Settles a completed vote. A tie sends the round back for another clue pass, up to twice, before falling to the imposters.';

revoke execute on function public.resolve_game_round(uuid) from public, anon, authenticated;

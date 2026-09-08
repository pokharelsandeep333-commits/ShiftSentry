-- The host can put a round back in the lobby at any point, not only from the
-- reveal.
--
-- Until now the one way out of a round was to play it to the end: clues, vote,
-- reveal, then `finish_game_round`. So a table that wanted to change a setting
-- mid-round -- more clue passes, a different category, an extra imposter,
-- someone who needs to leave -- had to sit through a game nobody was playing
-- any more, or the host had to end the whole room and everybody had to rejoin a
-- new code. Neither is a reasonable answer to "let's play that differently".
--
-- This ends the round and returns the room to LOBBY, where the settings form
-- already lives, so the next round starts with whatever the host changes.
--
-- Three decisions are worth stating:
--
--   The round row survives, marked. It keeps its clues, votes and secrets so
--   nothing dangles off a foreign key, and `abandoned_at` records that it never
--   reached a result. `game_room_scoreboard` already counts only rounds with an
--   outcome, so an abandoned round scores for nobody without that function
--   changing.
--
--   The word stays retired. `game_room_used_words` is not cleaned up, because
--   the imposter and the crew have both already seen it -- recycling it into a
--   later round in the same room would hand somebody the answer.
--
--   REVEAL is tolerated rather than refused. The host tapping this at the same
--   moment the last vote lands is a real race, and losing that race should not
--   produce an error nobody can act on. A round that already has an outcome
--   keeps it and is not marked abandoned, which makes this behave exactly like
--   `finish_game_round` in that window.
alter table public.game_rounds
  add column abandoned_at timestamptz;

comment on column public.game_rounds.abandoned_at is
  'Set when the host ended the round early. Such a round has no outcome and scores for nobody.';

grant select (abandoned_at) on public.game_rounds to authenticated;

create or replace function public.abandon_game_round(p_round_id uuid)
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
    raise exception 'Only the host can end this round.';
  end if;

  if round.status = 'ENDED' then
    raise exception 'That round is already over.';
  end if;

  update public.game_rounds
     set status = 'ENDED',
         ended_at = coalesce(ended_at, now()),
         -- Only an undecided round is an abandoned one. See the REVEAL note above.
         abandoned_at = case when outcome is null then now() else abandoned_at end
   where id = p_round_id;

  update public.game_rooms set status = 'LOBBY' where id = round.room_id;
end;
$$;

comment on function public.abandon_game_round(uuid) is
  'Host-only. Ends a round in progress with no result and returns the room to the lobby.';

revoke execute on function public.abandon_game_round(uuid) from public, anon;
grant execute on function public.abandon_game_round(uuid) to authenticated;

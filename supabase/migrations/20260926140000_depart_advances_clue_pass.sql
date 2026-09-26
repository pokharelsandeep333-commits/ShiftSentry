-- A departure that completes a clue pass moves the round on.
--
-- submit_game_clue advances the pass only right after it inserts a clue, and
-- game_round_turn steps over anyone who is no longer in the room. So if the one
-- player still owing a clue walked out, the turn came back null for everybody,
-- nobody could give a clue, and nothing advanced the round: it sat in CLUES
-- until the host abandoned it. depart_game_room now does what the missing clue
-- would have done -- next pass, DISCUSSION if the round has one, else VOTING --
-- using the same rule submit_game_clue uses, so a tiebreak pass (current_pass
-- already past clue_passes) goes straight back to the vote as it does there.
--
-- The check is written out rather than asking game_round_turn: that function
-- answers only for a caller who is a room member, and during a leave the caller
-- is the player who just left, so it would always say nobody owes anything.
--
-- Lock order. depart_game_room takes the room lock, then the round lock. To
-- settle a CLUES round it now has to take the round lock during CLUES, which is
-- exactly when reroll_game_word runs -- and the re-roll took them the other way
-- round: the round lock, then the room lock inside draw_game_word. A departure
-- holding the room and a re-roll holding the round would each wait on the other
-- until Postgres broke the deadlock by failing one of them. The re-roll now takes
-- the room lock first too, so every function that takes both takes room first.
-- (draw_game_word's own room lock is then a re-entrant no-op.)

create or replace function public.reroll_game_word(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  round_room uuid;
  round record;
  drawn_id bigint;
  secret record;
  related text;
begin
  -- A round never changes room, so this can be read before either lock is held.
  select room_id into round_room from public.game_rounds where id = p_round_id;

  if not found then
    raise exception 'Only the host can swap the word, and only before the first clue.';
  end if;

  -- Room, then round: the order depart_game_room takes them in.
  perform pg_advisory_xact_lock(hashtext(round_room::text));
  perform pg_advisory_xact_lock(hashtext(p_round_id::text));

  select game_rounds.id, game_rounds.room_id, game_rounds.status,
         game_rounds.imposter_hint, game_rounds.current_pass
    into round
    from public.game_rounds
    join public.game_rooms on game_rooms.id = game_rounds.room_id
    where game_rounds.id = p_round_id
      and game_rooms.host_id = actor;

  if not found or round.status <> 'CLUES' or round.current_pass <> 1 then
    raise exception 'Only the host can swap the word, and only before the first clue.';
  end if;

  if exists (select 1 from public.game_clues where round_id = p_round_id) then
    raise exception 'Too late to swap the word -- someone has already given a clue.';
  end if;

  drawn_id := public.draw_game_word(round.room_id);

  select word, decoy_word, category into secret
    from public.game_words where id = drawn_id;

  if round.imposter_hint = 'RELATED' then
    select other.word into related
      from public.game_words other
      where other.category = secret.category and other.id <> drawn_id
      order by random() limit 1;
    related := coalesce(related, secret.category);
  end if;

  update public.game_rounds set word_id = drawn_id where id = p_round_id;

  update public.game_round_secrets
     set assigned_word = case
           when role = 'CREW' then secret.word
           when round.imposter_hint = 'DECOY' then secret.decoy_word
           else null
         end,
         category_hint_text = case
           when role = 'CREW' then null
           when round.imposter_hint = 'CATEGORY' then secret.category
           when round.imposter_hint = 'RELATED' then related
           else null
         end
   where round_id = p_round_id;
end;
$$;

create or replace function public.depart_game_room(p_room_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  room_host uuid;
  successor uuid;
  live record;
  active integer;
  ballots integer;
  still_seated integer;
  still_owing integer;
begin
  -- Taken before the room is read, not after: two players leaving at once must
  -- serialise, and the host check below has to be made against the host as it
  -- is inside the lock.
  perform pg_advisory_xact_lock(hashtext(p_room_id::text));

  select host_id into room_host
    from public.game_rooms
    where id = p_room_id
      and status <> 'ENDED';

  if not found then
    return;
  end if;

  delete from public.game_room_players
   where room_id = p_room_id
     and user_id = p_user_id;

  if not found then
    return;
  end if;

  -- Any round still being played. Locked whatever its phase, not only the ones
  -- that need settling: read unlocked, a DISCUSSION round can open its vote, or
  -- a CLUES round take its last clue, between this read and the commit.
  select id into live
    from public.game_rounds
    where room_id = p_room_id
      and status not in ('REVEAL', 'ENDED')
    order by round_no desc
    limit 1;

  if found then
    -- The lock submit_game_clue, submit_game_vote and submit_game_final_guess
    -- take, so nothing lands between the clean-up and the count. Room, then
    -- round -- the order every function that takes both now uses.
    perform pg_advisory_xact_lock(hashtext(live.id::text));

    select id, status, current_pass, clue_passes, discussion_phase, caught_user_id
      into live
      from public.game_rounds
      where id = live.id;

    if live.status = 'CLUES' then
      -- Who is left, and who of them still owes a clue this pass. The same
      -- predicate as game_round_turn, minus its check on the caller.
      select count(*),
             count(*) filter (
               where not exists (
                 select 1 from public.game_clues clue
                 where clue.round_id = live.id
                   and clue.user_id = seat.user_id
                   and clue.pass_no = live.current_pass
               )
             )
        into still_seated, still_owing
        from public.game_round_players seat
        where seat.round_id = live.id
          and seat.eliminated_at is null
          and exists (
            select 1 from public.game_room_players member
            where member.room_id = p_room_id and member.user_id = seat.user_id
          );

      -- An empty table has nobody owing anything, and nobody to play the next
      -- phase either; leave that round alone.
      if still_seated > 0 and still_owing = 0 then
        if live.current_pass < live.clue_passes then
          update public.game_rounds set current_pass = current_pass + 1 where id = live.id;
        elsif live.discussion_phase then
          update public.game_rounds set status = 'DISCUSSION' where id = live.id;
        else
          update public.game_rounds set status = 'VOTING' where id = live.id;
        end if;
      end if;
    elsif live.status = 'VOTING' then
      delete from public.game_votes
       where round_id = live.id
         and (voter_id = p_user_id or target_id = p_user_id);

      select count(*) into active
        from public.game_round_players seat
        where seat.round_id = live.id
          and seat.eliminated_at is null
          and exists (
            select 1 from public.game_room_players member
            where member.room_id = p_room_id and member.user_id = seat.user_id
          );

      select count(*) into ballots
        from public.game_votes
        where round_id = live.id;

      if active > 0 and ballots >= active then
        perform public.resolve_game_round(live.id);
      end if;
    elsif live.status = 'GUESSING' and live.caught_user_id = p_user_id then
      update public.game_rounds
         set status = 'REVEAL', outcome = 'CREW_WIN', ended_at = now()
       where id = live.id;
    end if;
  end if;

  if room_host <> p_user_id then
    return;
  end if;

  select user_id into successor
    from public.game_room_players
    where room_id = p_room_id
    order by joined_at, user_id
    limit 1;

  if successor is null then
    update public.game_rooms
       set status = 'ENDED', ended_at = now()
     where id = p_room_id;
  else
    update public.game_rooms
       set host_id = successor
     where id = p_room_id;
  end if;
end;
$$;

comment on function public.depart_game_room(uuid, uuid) is
  'Internal. Removes a player from a room and settles what they leave behind: a clue pass they were last to owe, their live ballots, a pending guess, the host role.';

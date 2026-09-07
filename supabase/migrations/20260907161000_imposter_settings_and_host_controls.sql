-- Second pass on the game: one hint scale instead of two booleans, genuinely
-- hidden roles, and the host controls a real table of people needs.
--
-- The hint ladder replaces `decoy_mode` and `category_hint`, which were two
-- switches describing one thing -- how much help the imposter gets -- and could
-- be set to contradictory-looking combinations. `imposter_hint` is a single
-- scale:
--
--   NONE      nothing at all; bluff from the clues
--   CATEGORY  the category, but no word
--   RELATED   another word from the same category -- adjacent, not nearly-right
--   DECOY     the decoy word itself
--
-- Only DECOY hands the imposter a word, and that is exactly why `hide_roles`
-- requires it. On the lower rungs an empty word card *is* the tell: a player who
-- is told nothing knows what they are. Hiding roles is only meaningful when
-- everyone is holding something, which is the classic game -- you work out that
-- your word is the odd one from how badly the clues fit it. A check constraint
-- enforces the pairing rather than leaving it to the form.
--
-- `decoy_mode` and `category_hint` are kept and written as derived values. They
-- are NOT NULL on game_rounds and the previously deployed image still reads
-- them, and migrations here are applied before the new image is promoted -- so
-- dropping them would break the running app for the length of that window. A
-- later migration can remove them once nothing reads them.

alter table public.game_rooms
  add column imposter_hint text not null default 'NONE'
    check (imposter_hint in ('NONE', 'CATEGORY', 'RELATED', 'DECOY')),
  add column hide_roles boolean not null default false,
  add column ban_repeat_clues boolean not null default true,
  add column discussion_phase boolean not null default false;

alter table public.game_rounds
  add column imposter_hint text not null default 'NONE'
    check (imposter_hint in ('NONE', 'CATEGORY', 'RELATED', 'DECOY')),
  add column hide_roles boolean not null default false,
  add column ban_repeat_clues boolean not null default true,
  add column discussion_phase boolean not null default false;

update public.game_rooms
   set imposter_hint = case when decoy_mode then 'DECOY' when category_hint then 'CATEGORY' else 'NONE' end;

update public.game_rounds
   set imposter_hint = case when decoy_mode then 'DECOY' when category_hint then 'CATEGORY' else 'NONE' end;

alter table public.game_rooms
  add constraint game_rooms_hide_roles_needs_decoy
  check (not hide_roles or imposter_hint = 'DECOY');

alter table public.game_rounds
  add constraint game_rounds_hide_roles_needs_decoy
  check (not hide_roles or imposter_hint = 'DECOY');

comment on column public.game_round_secrets.category_hint_text is
  'Whatever help the imposter was given: the category on CATEGORY, a same-category word on RELATED, null otherwise. Named for its original, narrower use.';

grant select (
  id, room_id, round_no, status, decoy_mode, category_hint, imposter_final_guess,
  imposter_count, clue_passes, current_pass, started_at, ended_at,
  caught_user_id, final_guess, outcome,
  imposter_hint, hide_roles, ban_repeat_clues, discussion_phase
) on public.game_rounds to authenticated;

-- Your own secret now comes through a function, not a table read.
--
-- Hiding a role cannot be done in the UI. `game_round_secrets` was selectable by
-- its owner, so a hidden role would still be sitting in the network tab -- a
-- curtain, not a wall. Revoking the grant and serving the row through a function
-- makes the withholding real: while roles are hidden and the round is still
-- being played, `role` comes back null for everyone, including the imposter.
--
-- The row policy stays in place even though nothing reaches it now. It costs
-- nothing and it means a future `grant select` cannot silently expose other
-- players' rows.
revoke select on public.game_round_secrets from authenticated;

create or replace function public.game_my_round_secret(p_round_id uuid)
returns table (role text, assigned_word text, hint_text text, roles_hidden boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    case
      when round.hide_roles and round.status not in ('REVEAL', 'ENDED') then null
      else secret.role::text
    end,
    secret.assigned_word,
    secret.category_hint_text,
    round.hide_roles
  from public.game_round_secrets secret
  join public.game_rounds round on round.id = secret.round_id
  where secret.round_id = p_round_id
    and secret.user_id = (select auth.uid());
$$;

comment on function public.game_my_round_secret(uuid) is
  'The caller''s own word, hint and role for a round. Role is withheld while the round hides roles and is still in play.';

-- Deal a round, now with the hint ladder.
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
  related text;
begin
  if actor is null then
    raise exception 'You must be signed in.';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_room_id::text));

  select id, status, imposter_hint, hide_roles, ban_repeat_clues, discussion_phase,
         imposter_final_guess, imposter_count, clue_passes
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

  select word, decoy_word, category into secret
    from public.game_words where id = drawn_id;

  -- The RELATED rung: another word from the same category, which points at the
  -- right area without being nearly-right the way a decoy is. Falls back to the
  -- category name if the category somehow holds only this word, so the rung
  -- never silently degrades to no hint at all.
  if room.imposter_hint = 'RELATED' then
    select other.word into related
      from public.game_words other
      where other.category = secret.category
        and other.id <> drawn_id
      order by random()
      limit 1;

    related := coalesce(related, secret.category);
  end if;

  select coalesce(max(round_no), 0) + 1 into next_number
    from public.game_rounds where room_id = p_room_id;

  insert into public.game_rounds (
    room_id, round_no, word_id, status,
    imposter_hint, hide_roles, ban_repeat_clues, discussion_phase,
    imposter_final_guess, imposter_count, clue_passes,
    decoy_mode, category_hint
  )
  values (
    p_room_id, next_number, drawn_id, 'CLUES',
    room.imposter_hint, room.hide_roles, room.ban_repeat_clues, room.discussion_phase,
    room.imposter_final_guess, room.imposter_count, room.clue_passes,
    room.imposter_hint = 'DECOY', room.imposter_hint = 'CATEGORY'
  )
  returning id into new_round;

  insert into public.game_round_players (round_id, user_id, turn_order)
  select new_round, user_id, row_number() over (order by random())
    from public.game_room_players
    where room_id = p_room_id;

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
      when room.imposter_hint = 'DECOY' then secret.decoy_word
      else null
    end,
    case
      when chosen.user_id is null then null
      when room.imposter_hint = 'CATEGORY' then secret.category
      when room.imposter_hint = 'RELATED' then related
      else null
    end
  from public.game_round_players seat
  left join chosen on chosen.user_id = seat.user_id
  where seat.round_id = new_round;

  update public.game_rooms set status = 'PLAYING' where id = p_room_id;

  return new_round;
end;
$$;

-- Clues, now refusing repeats and routing through the discussion phase.
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

  select id, room_id, status, current_pass, clue_passes, ban_repeat_clues, discussion_phase
    into round
    from public.game_rounds
    where id = p_round_id;

  if not found or round.status <> 'CLUES' then
    raise exception 'This round is not taking clues.';
  end if;

  if public.game_round_turn(p_round_id) is distinct from actor then
    raise exception 'It is not your turn yet.';
  end if;

  -- Echoing the previous player is the safest thing an imposter can do: it
  -- commits to nothing and cannot be wrong. Refusing a clue already said forces
  -- everyone to put something of their own in.
  if round.ban_repeat_clues and exists (
    select 1 from public.game_clues
    where round_id = p_round_id
      and lower(btrim(clue)) = lower(cleaned)
  ) then
    raise exception 'Someone already said that. Give a different clue.';
  end if;

  insert into public.game_clues (round_id, user_id, pass_no, clue)
  values (p_round_id, actor, round.current_pass, cleaned);

  if public.game_round_turn(p_round_id) is null then
    if round.current_pass < round.clue_passes then
      update public.game_rounds set current_pass = current_pass + 1 where id = p_round_id;
    elsif round.discussion_phase then
      update public.game_rounds set status = 'DISCUSSION' where id = p_round_id;
    else
      update public.game_rounds set status = 'VOTING' where id = p_round_id;
    end if;
  end if;
end;
$$;

-- Close discussion and open the vote. Host only: leaving it to the first person
-- who clicks would let one player cut the conversation short.
create or replace function public.open_game_round_vote(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  update public.game_rounds
     set status = 'VOTING'
   where id = p_round_id
     and status = 'DISCUSSION'
     and exists (
       select 1 from public.game_rooms
       where game_rooms.id = game_rounds.room_id
         and game_rooms.host_id = actor
     );

  if not found then
    raise exception 'Only the host can open the vote, and only during discussion.';
  end if;
end;
$$;

comment on function public.open_game_round_vote(uuid) is
  'Host-only. Ends the discussion phase and opens voting.';

-- Draw a different word for a round that has not started talking yet.
--
-- Roles and seating are kept: this exists for the host who caught sight of the
-- word, or drew one nobody in the room could possibly clue, not as a way to
-- reshuffle who the imposter is until the host likes the answer. Refused once
-- the first clue is in, because by then the word is in play.
create or replace function public.reroll_game_word(p_round_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  round record;
  drawn_id bigint;
  secret record;
  related text;
begin
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

comment on function public.reroll_game_word(uuid) is
  'Host-only. Swaps the round''s word before any clue is given, keeping roles and seating.';

-- Remove someone from the room.
--
-- The host cannot kick themselves -- that is what leaving is for, and it would
-- strand the room with a host who is not in it. A kicked player's round seat
-- stays so their clues still have a name attached; the turn order steps over
-- them exactly as it does for someone who left on their own.
create or replace function public.kick_game_player(p_room_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null then
    raise exception 'You must be signed in.';
  end if;

  if p_user_id = actor then
    raise exception 'Use Leave game to remove yourself.';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_room_id::text));

  if not exists (
    select 1 from public.game_rooms
    where id = p_room_id and host_id = actor and status <> 'ENDED'
  ) then
    raise exception 'Only the host can remove a player.';
  end if;

  delete from public.game_room_players
   where room_id = p_room_id and user_id = p_user_id;
end;
$$;

comment on function public.kick_game_player(uuid, uuid) is
  'Host-only. Removes a player from the room; their round seat and clues remain.';

-- Who is winning, for the rooms's lifetime.
--
-- Counted from decided rounds only, and per side: a crew member wins when the
-- crew win, an imposter when the imposters do. Roles come from
-- game_round_secrets, which players cannot read -- which is the reason this is a
-- function rather than a view the client assembles.
create or replace function public.game_room_scoreboard(p_room_id uuid)
returns table (user_id uuid, rounds_played integer, wins integer, imposter_rounds integer, imposter_wins integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    secret.user_id,
    count(*)::integer,
    count(*) filter (
      where (secret.role = 'IMPOSTER' and round.outcome = 'IMPOSTER_WIN')
         or (secret.role = 'CREW' and round.outcome = 'CREW_WIN')
    )::integer,
    count(*) filter (where secret.role = 'IMPOSTER')::integer,
    count(*) filter (where secret.role = 'IMPOSTER' and round.outcome = 'IMPOSTER_WIN')::integer
  from public.game_round_secrets secret
  join public.game_rounds round on round.id = secret.round_id
  where round.room_id = p_room_id
    and round.outcome is not null
    and public.is_game_room_member(p_room_id)
  group by secret.user_id;
$$;

comment on function public.game_room_scoreboard(uuid) is
  'Per-player wins across a room''s decided rounds. Members only.';

-- The settings function takes a different shape now, so the old one goes.
drop function if exists public.update_game_room_settings(uuid, boolean, boolean, boolean, integer, integer, integer, text);

create or replace function public.update_game_room_settings(
  p_room_id uuid,
  p_imposter_hint text,
  p_hide_roles boolean,
  p_imposter_final_guess boolean,
  p_imposter_count integer,
  p_clue_passes integer,
  p_max_players integer,
  p_ban_repeat_clues boolean,
  p_discussion_phase boolean,
  p_category_filter text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  seated integer;
begin
  if actor is null then
    raise exception 'You must be signed in.';
  end if;

  if p_imposter_hint not in ('NONE', 'CATEGORY', 'RELATED', 'DECOY') then
    raise exception 'Unknown hint setting.';
  end if;

  if p_hide_roles and p_imposter_hint <> 'DECOY' then
    raise exception 'Roles can only be hidden when the imposter gets a decoy word.';
  end if;

  perform 1
    from public.game_rooms
    where id = p_room_id
      and host_id = actor
      and status = 'LOBBY';

  if not found then
    raise exception 'Only the host can change the settings, and only before a round starts.';
  end if;

  select count(*) into seated
    from public.game_room_players
    where room_id = p_room_id;

  if p_max_players < seated then
    raise exception 'There are already % players in this room.', seated;
  end if;

  update public.game_rooms
     set imposter_hint = p_imposter_hint,
         hide_roles = p_hide_roles,
         imposter_final_guess = p_imposter_final_guess,
         imposter_count = p_imposter_count,
         clue_passes = p_clue_passes,
         max_players = p_max_players,
         ban_repeat_clues = p_ban_repeat_clues,
         discussion_phase = p_discussion_phase,
         category_filter = nullif(btrim(p_category_filter), ''),
         decoy_mode = (p_imposter_hint = 'DECOY'),
         category_hint = (p_imposter_hint = 'CATEGORY')
   where id = p_room_id;
end;
$$;

comment on function public.update_game_room_settings(uuid, text, boolean, boolean, integer, integer, integer, boolean, boolean, text) is
  'Host-only settings update, refused once a round has been dealt.';

revoke execute on function public.game_my_round_secret(uuid) from public, anon;
revoke execute on function public.open_game_round_vote(uuid) from public, anon;
revoke execute on function public.reroll_game_word(uuid) from public, anon;
revoke execute on function public.kick_game_player(uuid, uuid) from public, anon;
revoke execute on function public.game_room_scoreboard(uuid) from public, anon;
revoke execute on function public.update_game_room_settings(uuid, text, boolean, boolean, integer, integer, integer, boolean, boolean, text) from public, anon;

grant execute on function public.game_my_round_secret(uuid) to authenticated;
grant execute on function public.open_game_round_vote(uuid) to authenticated;
grant execute on function public.reroll_game_word(uuid) to authenticated;
grant execute on function public.kick_game_player(uuid, uuid) to authenticated;
grant execute on function public.game_room_scoreboard(uuid) to authenticated;
grant execute on function public.update_game_room_settings(uuid, text, boolean, boolean, integer, integer, integer, boolean, boolean, text) to authenticated;

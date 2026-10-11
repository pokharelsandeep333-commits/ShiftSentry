-- Keep authorization valid until the mutation commits. All seating RPCs lock
-- profile -> room, the same order as disabling a profile and removing its seats.
-- FOR SHARE conflicts with non-key profile updates; FOR KEY SHARE would not.
create or replace function public.lock_enabled_game_account(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  disabled timestamptz;
begin
  select disabled_at into disabled
    from public.profiles where id = p_user_id for share;
  if not found then
    raise exception 'Your profile is not ready yet. Reload and try again.';
  end if;
  if disabled is not null then
    raise exception 'This account has been disabled.';
  end if;
end;
$$;

revoke execute on function public.lock_enabled_game_account(uuid) from public, anon, authenticated;

create or replace function public.refuse_disabled_game_player()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.lock_enabled_game_account(new.user_id);
  return new;
end;
$$;


create or replace function public.create_game_room(
  p_display_name text default null,
  p_decoy_mode boolean default false,
  p_category_hint boolean default false,
  p_imposter_final_guess boolean default true,
  p_imposter_count integer default 1,
  p_clue_passes integer default 1,
  p_max_players integer default 12,
  p_category_filter text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  seat_name text;
  new_room_id uuid;
  new_code text;
  attempts integer := 0;
begin
  if actor is null then
    raise exception 'You must be signed in to host a game.';
  end if;

  perform public.lock_enabled_game_account(actor);

  select coalesce(
    nullif(btrim(p_display_name), ''),
    nullif(btrim(profiles.display_name), ''),
    split_part(profiles.email, '@', 1)
  )
  into seat_name
  from public.profiles
  where profiles.id = actor;

  if seat_name is null then
    raise exception 'Your profile is not ready yet. Reload and try again.';
  end if;

  seat_name := left(seat_name, 40);

  update public.game_rooms
     set status = 'ENDED', ended_at = now()
   where host_id = actor
     and status <> 'ENDED';

  loop
    new_code := public.generate_game_room_code();

    begin
      insert into public.game_rooms (
        code, host_id, decoy_mode, category_hint, imposter_final_guess,
        imposter_count, clue_passes, max_players, category_filter
      )
      values (
        new_code, actor, p_decoy_mode, p_category_hint, p_imposter_final_guess,
        p_imposter_count, p_clue_passes, p_max_players,
        nullif(btrim(p_category_filter), '')
      )
      returning id into new_room_id;

      exit;
    exception when unique_violation then
      -- generate_game_room_code probes but does not reserve, so two hosts can
      -- still land on the same code between the probe and the insert. The
      -- partial unique index is the real guarantee; this just tries again.
      attempts := attempts + 1;
      if attempts >= 5 then
        raise exception 'Could not allocate a room code. Please try again.';
      end if;
    end;
  end loop;

  insert into public.game_room_players (room_id, user_id, display_name)
  values (new_room_id, actor, seat_name);

  return new_code;
end;
$$;

create or replace function public.join_game_room(
  p_code text,
  p_display_name text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  explicit_name text := left(nullif(btrim(p_display_name), ''), 40);
  seat_name text;
  found_room_id uuid;
  target_room record;
  seated integer;
begin
  if actor is null then
    raise exception 'You must be signed in to join a game.';
  end if;

  perform public.lock_enabled_game_account(actor);

  select coalesce(
    explicit_name,
    nullif(btrim(profiles.display_name), ''),
    split_part(profiles.email, '@', 1)
  )
  into seat_name
  from public.profiles
  where profiles.id = actor;

  if seat_name is null then
    raise exception 'Your profile is not ready yet. Reload and try again.';
  end if;

  seat_name := left(seat_name, 40);

  select id
    into found_room_id
    from public.game_rooms
    where code = upper(btrim(p_code))
      and status = 'LOBBY';

  if not found then
    raise exception 'That code does not match a game that is waiting for players.';
  end if;

  -- Serialise joins for this room so two players cannot both read a seat count
  -- below the cap and both take the last seat -- and so a join cannot land in
  -- the middle of a deal.
  perform pg_advisory_xact_lock(hashtext(found_room_id::text));

  select id, code, status, max_players
    into target_room
    from public.game_rooms
    where id = found_room_id;

  if target_room.status <> 'LOBBY' then
    raise exception 'That code does not match a game that is waiting for players.';
  end if;

  select count(*)
    into seated
    from public.game_room_players
    where room_id = target_room.id;

  if seated >= target_room.max_players
     and not exists (
       select 1
       from public.game_room_players
       where room_id = target_room.id
         and user_id = actor
     ) then
    raise exception 'That game is full.';
  end if;

  insert into public.game_room_players (room_id, user_id, display_name)
  values (target_room.id, actor, seat_name)
  on conflict (room_id, user_id)
  do update set
    -- A name you chose in the lobby survives re-opening the invite link. Only
    -- an explicit name overrides it.
    display_name = coalesce(explicit_name, public.game_room_players.display_name),
    last_seen_at = now();

  return target_room.code;
end;
$$;

-- Serialize settings with joins, departures and starts; lock the row for end_game_room too.

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
  p_word_difficulty text,
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
  available integer;
begin
  if actor is null then
    raise exception 'You must be signed in.';
  end if;

  if p_imposter_hint is null or p_imposter_hint not in ('NONE', 'CATEGORY', 'RELATED', 'DECOY') then
    raise exception 'Unknown hint setting.';
  end if;

  if p_word_difficulty is null or p_word_difficulty not in ('EASY', 'NORMAL', 'HARD') then
    raise exception 'Unknown difficulty setting.';
  end if;

  if p_hide_roles and p_imposter_hint <> 'DECOY' then
    raise exception 'Roles can only be hidden when the imposter gets a decoy word.';
  end if;

  perform public.lock_enabled_game_account(actor);
  perform pg_advisory_xact_lock(hashtext(p_room_id::text));

  perform 1
    from public.game_rooms
    where id = p_room_id
      and host_id = actor
      and status = 'LOBBY'
      and public.is_game_room_member(p_room_id)
    for update;

  if not found then
    raise exception 'Only the host can change the settings, and only before a round starts.';
  end if;

  select count(*) into seated
    from public.game_room_players
    where room_id = p_room_id;

  if p_max_players < seated then
    raise exception 'There are already % players in this room.', seated;
  end if;

  -- Refuse a combination with nothing in it, rather than letting the host find
  -- out when the first round will not deal. Narrow is fine; empty is not.
  select count(*) into available
    from public.game_words
    where (nullif(btrim(p_category_filter), '') is null
           or category = nullif(btrim(p_category_filter), ''))
      and difficulty = any(case p_word_difficulty
        when 'EASY' then array['EASY']
        when 'NORMAL' then array['EASY', 'NORMAL']
        else array['EASY', 'NORMAL', 'HARD']
      end);

  if available = 0 then
    raise exception 'No words match that category and difficulty. Widen one of them.';
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
         word_difficulty = p_word_difficulty,
         category_filter = nullif(btrim(p_category_filter), ''),
         decoy_mode = (p_imposter_hint = 'DECOY'),
         category_hint = (p_imposter_hint = 'CATEGORY')
   where id = p_room_id and host_id = actor and status = 'LOBBY';

  if not found then
    raise exception 'Only the host can change the settings, and only before a round starts.';
  end if;
end;
$$;

-- A stale seat never restores disabled-account access through RLS or RPC helpers.

create or replace function public.is_game_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.is_account_enabled()) and exists (
    select 1
    from public.game_room_players
    where room_id = p_room_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_game_round_member(p_round_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select public.is_account_enabled()) and exists (
    select 1
    from public.game_rounds
    join public.game_room_players
      on game_room_players.room_id = game_rounds.room_id
    where game_rounds.id = p_round_id
      and game_room_players.user_id = (select auth.uid())
  );
$$;


-- Repair seats left by a race before this migration, including ended rooms.
-- Take the profile first, so a concurrent eligibility check cannot pass cleanup.
do $$
declare
  disabled record;
  seat record;
begin
  for disabled in select id from public.profiles
    where disabled_at is not null order by id for update
  loop
    for seat in select room_id from public.game_room_players
      where user_id = disabled.id order by room_id
    loop
      perform public.depart_game_room(seat.room_id, disabled.id);
    end loop;
    delete from public.game_room_players where user_id = disabled.id;
  end loop;
end;
$$;

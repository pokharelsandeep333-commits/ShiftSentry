-- Foundation for the imposter word game: schema, access control, and the word
-- bank. This migration creates no write paths -- the round loop (deal roles,
-- submit a clue, vote, reveal) lands in a later migration alongside the UI.
-- What it does establish is the security boundary the whole game rests on, and
-- that boundary is worth stating plainly before the tables:
--
--   The secret word must never reach the imposter's browser.
--
-- Everything below follows from that one sentence.
--
-- Three separate leaks have to be closed, and they need three different
-- mechanisms because Postgres grants and RLS operate on different axes.
--
--   1. The word bank itself (`game_words`) is readable by nobody. RLS is on
--      with no policy, and `authenticated` gets no grant at all. In decoy mode
--      the imposter is holding the decoy -- if they could read the bank they
--      would find the ('coffee', 'tea') row and learn the real word without
--      playing. The same applies to `game_room_used_words`: the list of word
--      ids a room has burned through, cross-referenced against ids learned at
--      previous reveals, narrows the current answer. Only the security definer
--      draw function reads either table.
--
--   2. `game_rounds.word_id` is hidden with a column-level grant. Players need
--      the rest of the round row (status, pass number, timing), so the row has
--      to be selectable; only that one column does not. A column grant is the
--      right tool because the column is hidden from *everyone*, uniformly.
--      Hiding it matters even though the bank is unreadable: an id is stable
--      across rooms, so a player who saw id 4271 revealed as "coffee" last
--      night would recognise it in tonight's room, where the per-room used-word
--      list offers no protection.
--
--   3. Each player's own role and word live in `game_round_secrets`, a separate
--      table from `game_round_players`. This split is the part that looks like
--      over-normalisation and is not. The rule needed is "every member of the
--      room may see who is playing and in what order, but only you may see your
--      own role" -- per-row *and* per-column at once. A column grant cannot say
--      that: it would hide `role` from its owner too. Splitting the columns into
--      a table whose policy is `user_id = auth.uid()` says it exactly, and makes
--      the boundary a whole table rather than a column, which is much harder to
--      widen by accident in a later migration.
--
-- Writes follow the same reasoning. Almost nothing here grants insert or update
-- to `authenticated`, because nearly every mutation in this game is a rule the
-- player must not be able to choose: you cannot assign yourself CREW, vote
-- twice, or take a turn out of order. Those arrive as security definer
-- functions in the round-loop migration, so the database enforces the game the
-- same way it already enforces weekly limits -- independently of the app.

create type public.game_room_status as enum ('LOBBY', 'PLAYING', 'ENDED');
create type public.game_round_status as enum ('DEALING', 'CLUES', 'VOTING', 'REVEAL', 'ENDED');
create type public.game_player_role as enum ('CREW', 'IMPOSTER');

-- Word pairs. Seeded always as a pair even though the no-decoy mode ignores
-- `decoy_word`, because the mode is a per-round host toggle: a bank of bare
-- words would have to be re-seeded from scratch the first time someone turns
-- decoy mode on. `bigint identity` rather than the uuid the rest of this schema
-- uses -- these ids are never exposed to a client (see note 2 above), and a
-- narrow sequential key keeps `game_room_used_words` small and its inserts
-- local to the end of the index.
create table public.game_words (
  id bigint generated always as identity primary key,
  word text not null unique check (char_length(word) between 2 and 40),
  decoy_word text not null check (char_length(decoy_word) between 2 and 40),
  category text not null check (char_length(category) between 2 and 40),
  constraint game_words_pair_distinct check (lower(word) <> lower(decoy_word))
);

create index game_words_category_idx on public.game_words (category);

create table public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[ABCDEFGHJKMNPQRSTVWXYZ23456789]{6}$'),
  host_id uuid not null references public.profiles(id) on delete cascade,
  status public.game_room_status not null default 'LOBBY',

  -- Host settings. Explicit columns with check constraints rather than a jsonb
  -- blob, so an out-of-range value is rejected by the database and not only by
  -- the Zod schema -- the same dual-layer arrangement the shift rules use.
  decoy_mode boolean not null default false,
  category_hint boolean not null default false,
  imposter_final_guess boolean not null default true,
  imposter_count integer not null default 1 check (imposter_count between 1 and 3),
  clue_passes integer not null default 1 check (clue_passes between 1 and 3),
  max_players integer not null default 12 check (max_players between 3 and 20),
  category_filter text check (char_length(category_filter) between 2 and 40),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  ended_at timestamptz
);

-- Codes are unique among rooms still in play, not for all time. A six-character
-- code from a 30-character alphabet has plenty of room, but recycling the codes
-- of finished games keeps them short forever instead of forcing a longer code
-- once the table has grown. `where status <> 'ENDED'` is what makes that safe:
-- two live rooms can never share a code, which is the only window in which a
-- player types one.
create unique index game_rooms_active_code_idx on public.game_rooms (code) where status <> 'ENDED';
create index game_rooms_host_idx on public.game_rooms (host_id);

create table public.game_room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint game_room_players_unique_member unique (room_id, user_id)
);

create index game_room_players_user_idx on public.game_room_players (user_id);

-- A round snapshots the settings it was dealt under rather than reading them
-- back off the room. Same reasoning as the shift earnings snapshot: the host
-- can change decoy mode or the imposter count between rounds, and a finished
-- round has to keep meaning what it meant when it was played. Reading the live
-- room settings at reveal time would re-interpret history -- a round dealt with
-- no decoy would render as though the imposter had been given one.
create table public.game_rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  round_no integer not null check (round_no > 0),
  word_id bigint not null references public.game_words(id) on delete restrict,
  status public.game_round_status not null default 'DEALING',

  decoy_mode boolean not null,
  category_hint boolean not null,
  imposter_final_guess boolean not null,
  imposter_count integer not null check (imposter_count between 1 and 3),
  clue_passes integer not null check (clue_passes between 1 and 3),

  current_pass integer not null default 1 check (current_pass > 0),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint game_rounds_unique_number unique (room_id, round_no)
);

create index game_rounds_word_idx on public.game_rounds (word_id);

-- Who is playing this round and in what order. Deliberately carries nothing
-- secret -- see note 3 in the header.
create table public.game_round_players (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.game_rounds(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  turn_order integer not null check (turn_order > 0),
  eliminated_at timestamptz,
  constraint game_round_players_unique_member unique (round_id, user_id),
  constraint game_round_players_unique_order unique (round_id, turn_order)
);

create index game_round_players_user_idx on public.game_round_players (user_id);

-- The secret half of the row above, split off so that "only you may see your
-- own role" can be expressed as a row policy.
--
-- `assigned_word` is null for an imposter in no-decoy mode and holds the decoy
-- in decoy mode, so a null here is meaningful rather than missing: it is the
-- imposter being handed nothing. `role` is what the reveal reads; the word is
-- what the player's own screen reads.
create table public.game_round_secrets (
  round_id uuid not null references public.game_rounds(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.game_player_role not null,
  assigned_word text check (char_length(assigned_word) between 2 and 40),
  constraint game_round_secrets_pkey primary key (round_id, user_id),
  constraint game_round_secrets_crew_has_word check (role <> 'CREW' or assigned_word is not null)
);

create index game_round_secrets_user_idx on public.game_round_secrets (user_id);

create table public.game_clues (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.game_rounds(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  pass_no integer not null check (pass_no > 0),
  clue text not null check (char_length(btrim(clue)) between 1 and 40),
  created_at timestamptz not null default now(),
  constraint game_clues_one_per_pass unique (round_id, user_id, pass_no)
);

create index game_clues_round_pass_idx on public.game_clues (round_id, pass_no);
create index game_clues_user_idx on public.game_clues (user_id);

create table public.game_votes (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.game_rounds(id) on delete cascade,
  voter_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint game_votes_one_per_round unique (round_id, voter_id),
  constraint game_votes_no_self_vote check (voter_id <> target_id)
);

create index game_votes_round_target_idx on public.game_votes (round_id, target_id);
create index game_votes_voter_idx on public.game_votes (voter_id);
create index game_votes_target_idx on public.game_votes (target_id);

-- Which words a room has already drawn. Rows are deleted wholesale when a room
-- exhausts the bank and starts cycling, so this stays small.
create table public.game_room_used_words (
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  word_id bigint not null references public.game_words(id) on delete cascade,
  used_at timestamptz not null default now(),
  constraint game_room_used_words_pkey primary key (room_id, word_id)
);

create index game_room_used_words_word_idx on public.game_room_used_words (word_id);

create trigger game_rooms_updated_at before update on public.game_rooms
for each row execute procedure public.set_updated_at();

-- Membership helpers.
--
-- Both are security definer for the same reason: the natural policy on
-- `game_room_players` is "you may see the players of a room you are in", which
-- read literally is a policy on the table that has to query the table to
-- evaluate itself. Postgres detects that as infinite recursion and errors. A
-- definer function is not subject to the policy, so the recursion is broken --
-- and per the RLS guidance the identity check happens inside the function body,
-- against auth.uid(), so it cannot be pointed at a room the caller is not in.
--
-- These are called from policy expressions, which are evaluated with the
-- privileges of the querying user, so `authenticated` genuinely needs EXECUTE
-- here -- unlike the trigger-only functions elsewhere in this schema.

create or replace function public.is_game_room_member(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.game_room_players
    where room_id = p_room_id
      and user_id = (select auth.uid())
  );
$$;

comment on function public.is_game_room_member(uuid) is
  'True when the calling user has joined the given game room. Security definer to break RLS recursion on game_room_players.';

create or replace function public.is_game_round_member(p_round_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.game_rounds
    join public.game_room_players
      on game_room_players.room_id = game_rounds.room_id
    where game_rounds.id = p_round_id
      and game_room_players.user_id = (select auth.uid())
  );
$$;

comment on function public.is_game_round_member(uuid) is
  'True when the calling user is in the room that owns the given round.';

revoke execute on function public.is_game_room_member(uuid) from public, anon;
revoke execute on function public.is_game_round_member(uuid) from public, anon;
grant execute on function public.is_game_room_member(uuid) to authenticated;
grant execute on function public.is_game_round_member(uuid) to authenticated;

-- Draw a word this room has not used yet.
--
-- The advisory lock is the point of the function. Without it two clients that
-- both hit "start round" can each run the NOT EXISTS check before either
-- inserts, both see the same word as unused, and the room plays the same word
-- twice -- which is precisely the repeat this table exists to prevent. Taking
-- the lock on the room id serialises draws per room without blocking any other
-- room, the same shape as the per-user lock in enforce_shift_weekly_limits.
--
-- Exhausting the bank clears the room's history and starts a fresh cycle rather
-- than failing. A room that has genuinely played every word has earned a repeat,
-- and refusing to deal a round would be a worse outcome than one.
--
-- Granted to authenticated rather than kept for internal callers only: the body
-- requires the caller to be the host of a live room, and the worst a host can do
-- by calling it directly is consume words from their own room's pool.
create or replace function public.draw_game_word(p_room_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  room_filter text;
  drawn_word_id bigint;
begin
  select category_filter
    into room_filter
    from public.game_rooms
    where id = p_room_id
      and host_id = (select auth.uid())
      and status <> 'ENDED';

  if not found then
    raise exception 'Only the host of an active room can draw a word.';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_room_id::text));

  select game_words.id
    into drawn_word_id
    from public.game_words
    where (room_filter is null or game_words.category = room_filter)
      and not exists (
        select 1
        from public.game_room_used_words
        where game_room_used_words.room_id = p_room_id
          and game_room_used_words.word_id = game_words.id
      )
    order by random()
    limit 1;

  if drawn_word_id is null then
    delete from public.game_room_used_words where room_id = p_room_id;

    select game_words.id
      into drawn_word_id
      from public.game_words
      where (room_filter is null or game_words.category = room_filter)
      order by random()
      limit 1;
  end if;

  if drawn_word_id is null then
    raise exception 'No words are available for this category.';
  end if;

  insert into public.game_room_used_words (room_id, word_id)
  values (p_room_id, drawn_word_id);

  return drawn_word_id;
end;
$$;

comment on function public.draw_game_word(uuid) is
  'Draws a word the room has not played yet, recording it as used. Host only; serialised per room by an advisory lock.';

-- Six characters from an alphabet with no I, L, O, U, 0 or 1, so a code read
-- aloud or retyped from a screenshot cannot be misheard as another valid code.
-- 30^6 is about 729 million, and only codes of rooms still in play are taken.
--
-- This probes for a free code but does not reserve it, so the insert that uses
-- the result still has to handle a unique violation on game_rooms_active_code_idx
-- and retry. That race is vanishingly rare and the index is the real guarantee;
-- this function only keeps the first attempt from usually colliding.
create or replace function public.generate_game_room_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
  candidate text;
  attempts integer := 0;
begin
  loop
    candidate := '';

    for char_index in 1..6 loop
      candidate := candidate || substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
    end loop;

    exit when not exists (
      select 1
      from public.game_rooms
      where code = candidate
        and status <> 'ENDED'
    );

    attempts := attempts + 1;

    if attempts >= 20 then
      raise exception 'Could not allocate a room code.';
    end if;
  end loop;

  return candidate;
end;
$$;

comment on function public.generate_game_room_code() is
  'Returns a six-character room code not currently held by a live room.';

revoke execute on function public.draw_game_word(uuid) from public, anon;
revoke execute on function public.generate_game_room_code() from public, anon;
grant execute on function public.draw_game_word(uuid) to authenticated;
grant execute on function public.generate_game_room_code() to authenticated;

alter table public.game_words enable row level security;
alter table public.game_rooms enable row level security;
alter table public.game_room_players enable row level security;
alter table public.game_rounds enable row level security;
alter table public.game_round_players enable row level security;
alter table public.game_round_secrets enable row level security;
alter table public.game_clues enable row level security;
alter table public.game_votes enable row level security;
alter table public.game_room_used_words enable row level security;

-- This project carries default privileges that grant new public tables to anon,
-- authenticated and service_role, so every table has to be revoked before it can
-- be granted back narrowly -- enabling RLS alone would leave the grants in place
-- and, worse, leave a table with no policy looking protected while its grants say
-- otherwise. The same assumption caught 20260902034021 out on a function grant.
revoke all on public.game_words from anon, authenticated;
revoke all on public.game_rooms from anon, authenticated;
revoke all on public.game_room_players from anon, authenticated;
revoke all on public.game_rounds from anon, authenticated;
revoke all on public.game_round_players from anon, authenticated;
revoke all on public.game_round_secrets from anon, authenticated;
revoke all on public.game_clues from anon, authenticated;
revoke all on public.game_votes from anon, authenticated;
revoke all on public.game_room_used_words from anon, authenticated;

-- game_words and game_room_used_words are granted to nobody on purpose: RLS is
-- on with no policy and there is no grant, so both are unreachable except through
-- draw_game_word. See notes 1 and 2 in the header.

grant select on public.game_rooms to authenticated;
grant select on public.game_room_players to authenticated;
grant select on public.game_round_players to authenticated;
grant select on public.game_round_secrets to authenticated;
grant select on public.game_clues to authenticated;
grant select on public.game_votes to authenticated;

-- Column-level grant: every round column except word_id. A client that selects
-- `*` from this table gets "permission denied for table game_rounds" rather than
-- the word id, so the round query has to name its columns -- which is the point,
-- and is worth the small inconvenience of not being able to use `select *`.
grant select (
  id,
  room_id,
  round_no,
  status,
  decoy_mode,
  category_hint,
  imposter_final_guess,
  imposter_count,
  clue_passes,
  current_pass,
  started_at,
  ended_at
) on public.game_rounds to authenticated;

create policy "members read their rooms" on public.game_rooms
  for select using (public.is_game_room_member(id) or host_id = (select auth.uid()));

create policy "members read the roster" on public.game_room_players
  for select using (public.is_game_room_member(room_id));

create policy "members read rounds" on public.game_rounds
  for select using (public.is_game_room_member(room_id));

create policy "members read round seating" on public.game_round_players
  for select using (public.is_game_round_member(round_id));

-- The whole game in one policy: your role and your word, nobody else's. There is
-- deliberately no room-membership clause here -- it would be redundant, and every
-- extra term is another chance to widen this by accident.
create policy "players read only their own secret" on public.game_round_secrets
  for select using ((select auth.uid()) = user_id);

create policy "members read clues" on public.game_clues
  for select using (public.is_game_round_member(round_id));

create policy "members read votes" on public.game_votes
  for select using (public.is_game_round_member(round_id));

-- Word bank.
--
-- 646 pairs across 13 categories. Every entry carries a decoy even
-- though the default no-decoy mode ignores it, so turning decoy mode on is a
-- host toggle rather than a re-seed. A decoy is chosen to be close enough that
-- a vague clue fits both -- 'coffee' against 'tea', not against 'bulldozer' --
-- because a decoy the imposter can obviously tell is wrong gives the game away
-- in the first pass.
--
-- Only `word` is unique. Decoys repeat freely across pairs, which is why some
-- appear more than once below.

insert into public.game_words (word, decoy_word, category) values
  ('coffee', 'tea', 'Food & Drink'),
  ('pizza', 'burger', 'Food & Drink'),
  ('pasta', 'noodles', 'Food & Drink'),
  ('bread', 'toast', 'Food & Drink'),
  ('butter', 'margarine', 'Food & Drink'),
  ('cheese', 'yogurt', 'Food & Drink'),
  ('milk', 'cream', 'Food & Drink'),
  ('sugar', 'salt', 'Food & Drink'),
  ('pepper', 'chili', 'Food & Drink'),
  ('rice', 'quinoa', 'Food & Drink'),
  ('soup', 'stew', 'Food & Drink'),
  ('salad', 'coleslaw', 'Food & Drink'),
  ('sandwich', 'wrap', 'Food & Drink'),
  ('taco', 'burrito', 'Food & Drink'),
  ('sushi', 'sashimi', 'Food & Drink'),
  ('steak', 'roast', 'Food & Drink'),
  ('bacon', 'ham', 'Food & Drink'),
  ('sausage', 'hot dog', 'Food & Drink'),
  ('chicken', 'turkey', 'Food & Drink'),
  ('omelette', 'scrambled eggs', 'Food & Drink'),
  ('pancake', 'waffle', 'Food & Drink'),
  ('donut', 'bagel', 'Food & Drink'),
  ('cake', 'pie', 'Food & Drink'),
  ('cookie', 'biscuit', 'Food & Drink'),
  ('chocolate', 'caramel', 'Food & Drink'),
  ('ice cream', 'gelato', 'Food & Drink'),
  ('honey', 'syrup', 'Food & Drink'),
  ('jam', 'jelly', 'Food & Drink'),
  ('apple', 'pear', 'Food & Drink'),
  ('banana', 'plantain', 'Food & Drink'),
  ('orange', 'tangerine', 'Food & Drink'),
  ('grape', 'berry', 'Food & Drink'),
  ('strawberry', 'raspberry', 'Food & Drink'),
  ('watermelon', 'cantaloupe', 'Food & Drink'),
  ('mango', 'papaya', 'Food & Drink'),
  ('pineapple', 'coconut', 'Food & Drink'),
  ('lemon', 'lime', 'Food & Drink'),
  ('peach', 'apricot', 'Food & Drink'),
  ('potato', 'yam', 'Food & Drink'),
  ('tomato', 'eggplant', 'Food & Drink'),
  ('carrot', 'parsnip', 'Food & Drink'),
  ('onion', 'garlic', 'Food & Drink'),
  ('broccoli', 'cauliflower', 'Food & Drink'),
  ('spinach', 'kale', 'Food & Drink'),
  ('mushroom', 'truffle', 'Food & Drink'),
  ('cucumber', 'zucchini', 'Food & Drink'),
  ('corn', 'wheat', 'Food & Drink'),
  ('beans', 'lentils', 'Food & Drink'),
  ('popcorn', 'pretzel', 'Food & Drink'),
  ('crackers', 'chips', 'Food & Drink'),
  ('soda', 'juice', 'Food & Drink'),
  ('beer', 'wine', 'Food & Drink'),
  ('whiskey', 'vodka', 'Food & Drink'),
  ('smoothie', 'milkshake', 'Food & Drink'),
  ('cereal', 'oatmeal', 'Food & Drink'),
  ('curry', 'goulash', 'Food & Drink'),
  ('dumpling', 'ravioli', 'Food & Drink'),
  ('pancetta', 'prosciutto', 'Food & Drink'),
  ('baguette', 'croissant', 'Food & Drink'),
  ('muffin', 'cupcake', 'Food & Drink'),
  ('dog', 'wolf', 'Animals'),
  ('cat', 'lynx', 'Animals'),
  ('horse', 'donkey', 'Animals'),
  ('cow', 'buffalo', 'Animals'),
  ('sheep', 'goat', 'Animals'),
  ('pig', 'boar', 'Animals'),
  ('hen', 'duck', 'Animals'),
  ('rabbit', 'hare', 'Animals'),
  ('mouse', 'rat', 'Animals'),
  ('squirrel', 'chipmunk', 'Animals'),
  ('deer', 'elk', 'Animals'),
  ('bear', 'panda', 'Animals'),
  ('lion', 'tiger', 'Animals'),
  ('leopard', 'cheetah', 'Animals'),
  ('elephant', 'rhino', 'Animals'),
  ('giraffe', 'camel', 'Animals'),
  ('zebra', 'antelope', 'Animals'),
  ('monkey', 'baboon', 'Animals'),
  ('gorilla', 'chimpanzee', 'Animals'),
  ('kangaroo', 'wallaby', 'Animals'),
  ('koala', 'sloth', 'Animals'),
  ('fox', 'coyote', 'Animals'),
  ('otter', 'beaver', 'Animals'),
  ('seal', 'walrus', 'Animals'),
  ('dolphin', 'porpoise', 'Animals'),
  ('whale', 'shark', 'Animals'),
  ('octopus', 'squid', 'Animals'),
  ('crab', 'lobster', 'Animals'),
  ('shrimp', 'prawn', 'Animals'),
  ('jellyfish', 'anemone', 'Animals'),
  ('turtle', 'tortoise', 'Animals'),
  ('crocodile', 'alligator', 'Animals'),
  ('lizard', 'gecko', 'Animals'),
  ('snake', 'eel', 'Animals'),
  ('frog', 'toad', 'Animals'),
  ('eagle', 'hawk', 'Animals'),
  ('owl', 'falcon', 'Animals'),
  ('penguin', 'puffin', 'Animals'),
  ('parrot', 'macaw', 'Animals'),
  ('pigeon', 'dove', 'Animals'),
  ('crow', 'raven', 'Animals'),
  ('swan', 'goose', 'Animals'),
  ('flamingo', 'heron', 'Animals'),
  ('peacock', 'pheasant', 'Animals'),
  ('bee', 'wasp', 'Animals'),
  ('butterfly', 'moth', 'Animals'),
  ('ant', 'termite', 'Animals'),
  ('spider', 'scorpion', 'Animals'),
  ('beetle', 'cockroach', 'Animals'),
  ('hedgehog', 'porcupine', 'Animals'),
  ('bat', 'flying squirrel', 'Animals'),
  ('hamster', 'guinea pig', 'Animals'),
  ('ferret', 'weasel', 'Animals'),
  ('llama', 'alpaca', 'Animals'),
  ('hippo', 'manatee', 'Animals'),
  ('hospital', 'pharmacy', 'Places'),
  ('school', 'university', 'Places'),
  ('library', 'bookstore', 'Places'),
  ('museum', 'art gallery', 'Places'),
  ('restaurant', 'cafe', 'Places'),
  ('bar', 'nightclub', 'Places'),
  ('hotel', 'motel', 'Places'),
  ('airport', 'train station', 'Places'),
  ('bank', 'post office', 'Places'),
  ('supermarket', 'corner shop', 'Places'),
  ('mall', 'market', 'Places'),
  ('cinema', 'theatre', 'Places'),
  ('stadium', 'arena', 'Places'),
  ('gym', 'yoga studio', 'Places'),
  ('park', 'garden', 'Places'),
  ('zoo', 'aquarium', 'Places'),
  ('beach', 'lakeshore', 'Places'),
  ('church', 'temple', 'Places'),
  ('castle', 'palace', 'Places'),
  ('prison', 'courthouse', 'Places'),
  ('police station', 'fire station', 'Places'),
  ('factory', 'warehouse', 'Places'),
  ('farm', 'ranch', 'Places'),
  ('office', 'co-working space', 'Places'),
  ('barbershop', 'salon', 'Places'),
  ('bakery', 'deli', 'Places'),
  ('laundromat', 'dry cleaner', 'Places'),
  ('gas station', 'rest stop', 'Places'),
  ('campsite', 'cabin', 'Places'),
  ('lighthouse', 'watchtower', 'Places'),
  ('bridge', 'tunnel', 'Places'),
  ('harbour', 'marina', 'Places'),
  ('subway', 'tram stop', 'Places'),
  ('parking garage', 'driveway', 'Places'),
  ('basement', 'attic', 'Places'),
  ('balcony', 'porch', 'Places'),
  ('kitchen', 'pantry', 'Places'),
  ('bathroom', 'laundry room', 'Places'),
  ('bedroom', 'guest room', 'Places'),
  ('classroom', 'lecture hall', 'Places'),
  ('hallway', 'lobby', 'Places'),
  ('rooftop', 'terrace', 'Places'),
  ('elevator', 'stairwell', 'Places'),
  ('greenhouse', 'shed', 'Places'),
  ('cemetery', 'memorial', 'Places'),
  ('observatory', 'planetarium', 'Places'),
  ('casino', 'arcade', 'Places'),
  ('bowling alley', 'skating rink', 'Places'),
  ('amusement park', 'carnival', 'Places'),
  ('desert', 'canyon', 'Places'),
  ('island', 'peninsula', 'Places'),
  ('village', 'suburb', 'Places'),
  ('doctor', 'nurse', 'Jobs & Roles'),
  ('dentist', 'orthodontist', 'Jobs & Roles'),
  ('surgeon', 'paramedic', 'Jobs & Roles'),
  ('teacher', 'tutor', 'Jobs & Roles'),
  ('professor', 'principal', 'Jobs & Roles'),
  ('lawyer', 'judge', 'Jobs & Roles'),
  ('police officer', 'security guard', 'Jobs & Roles'),
  ('firefighter', 'lifeguard', 'Jobs & Roles'),
  ('soldier', 'sailor', 'Jobs & Roles'),
  ('pilot', 'flight attendant', 'Jobs & Roles'),
  ('driver', 'courier', 'Jobs & Roles'),
  ('chef', 'baker', 'Jobs & Roles'),
  ('waiter', 'bartender', 'Jobs & Roles'),
  ('farmer', 'gardener', 'Jobs & Roles'),
  ('fisherman', 'hunter', 'Jobs & Roles'),
  ('carpenter', 'plumber', 'Jobs & Roles'),
  ('electrician', 'mechanic', 'Jobs & Roles'),
  ('architect', 'engineer', 'Jobs & Roles'),
  ('scientist', 'researcher', 'Jobs & Roles'),
  ('programmer', 'designer', 'Jobs & Roles'),
  ('accountant', 'auditor', 'Jobs & Roles'),
  ('banker', 'broker', 'Jobs & Roles'),
  ('journalist', 'editor', 'Jobs & Roles'),
  ('photographer', 'videographer', 'Jobs & Roles'),
  ('musician', 'singer', 'Jobs & Roles'),
  ('actor', 'comedian', 'Jobs & Roles'),
  ('dancer', 'choreographer', 'Jobs & Roles'),
  ('painter', 'sculptor', 'Jobs & Roles'),
  ('writer', 'poet', 'Jobs & Roles'),
  ('librarian', 'archivist', 'Jobs & Roles'),
  ('barber', 'hairdresser', 'Jobs & Roles'),
  ('tailor', 'cobbler', 'Jobs & Roles'),
  ('butcher', 'fishmonger', 'Jobs & Roles'),
  ('cashier', 'shopkeeper', 'Jobs & Roles'),
  ('salesman', 'marketer', 'Jobs & Roles'),
  ('receptionist', 'secretary', 'Jobs & Roles'),
  ('janitor', 'housekeeper', 'Jobs & Roles'),
  ('babysitter', 'nanny', 'Jobs & Roles'),
  ('therapist', 'counsellor', 'Jobs & Roles'),
  ('veterinarian', 'zookeeper', 'Jobs & Roles'),
  ('astronaut', 'test pilot', 'Jobs & Roles'),
  ('referee', 'coach', 'Jobs & Roles'),
  ('athlete', 'trainer', 'Jobs & Roles'),
  ('magician', 'juggler', 'Jobs & Roles'),
  ('clown', 'mime', 'Jobs & Roles'),
  ('priest', 'monk', 'Jobs & Roles'),
  ('politician', 'diplomat', 'Jobs & Roles'),
  ('detective', 'spy', 'Jobs & Roles'),
  ('pharmacist', 'chemist', 'Jobs & Roles'),
  ('translator', 'interpreter', 'Jobs & Roles'),
  ('miner', 'quarry worker', 'Jobs & Roles'),
  ('blacksmith', 'welder', 'Jobs & Roles'),
  ('football', 'rugby', 'Sports & Games'),
  ('basketball', 'netball', 'Sports & Games'),
  ('baseball', 'cricket', 'Sports & Games'),
  ('tennis', 'badminton', 'Sports & Games'),
  ('golf', 'mini golf', 'Sports & Games'),
  ('hockey', 'lacrosse', 'Sports & Games'),
  ('volleyball', 'handball', 'Sports & Games'),
  ('swimming', 'diving', 'Sports & Games'),
  ('running', 'jogging', 'Sports & Games'),
  ('marathon', 'triathlon', 'Sports & Games'),
  ('cycling', 'mountain biking', 'Sports & Games'),
  ('boxing', 'wrestling', 'Sports & Games'),
  ('karate', 'judo', 'Sports & Games'),
  ('fencing', 'archery', 'Sports & Games'),
  ('gymnastics', 'acrobatics', 'Sports & Games'),
  ('skiing', 'snowboarding', 'Sports & Games'),
  ('skating', 'rollerblading', 'Sports & Games'),
  ('surfing', 'windsurfing', 'Sports & Games'),
  ('sailing', 'rowing', 'Sports & Games'),
  ('climbing', 'bouldering', 'Sports & Games'),
  ('bowling', 'curling', 'Sports & Games'),
  ('darts', 'billiards', 'Sports & Games'),
  ('chess', 'checkers', 'Sports & Games'),
  ('poker', 'blackjack', 'Sports & Games'),
  ('bingo', 'lottery', 'Sports & Games'),
  ('dominoes', 'mahjong', 'Sports & Games'),
  ('crossword', 'sudoku', 'Sports & Games'),
  ('jigsaw', 'rubiks cube', 'Sports & Games'),
  ('hide and seek', 'tag', 'Sports & Games'),
  ('charades', 'pictionary', 'Sports & Games'),
  ('monopoly', 'scrabble', 'Sports & Games'),
  ('dodgeball', 'kickball', 'Sports & Games'),
  ('trampoline', 'bungee jumping', 'Sports & Games'),
  ('skateboarding', 'scootering', 'Sports & Games'),
  ('horse racing', 'greyhound racing', 'Sports & Games'),
  ('polo', 'equestrian', 'Sports & Games'),
  ('weightlifting', 'powerlifting', 'Sports & Games'),
  ('yoga', 'pilates', 'Sports & Games'),
  ('aerobics', 'zumba', 'Sports & Games'),
  ('hiking', 'trekking', 'Sports & Games'),
  ('fishing', 'spearfishing', 'Sports & Games'),
  ('paintball', 'laser tag', 'Sports & Games'),
  ('bobsled', 'luge', 'Sports & Games'),
  ('kayaking', 'canoeing', 'Sports & Games'),
  ('rafting', 'tubing', 'Sports & Games'),
  ('parachuting', 'paragliding', 'Sports & Games'),
  ('table tennis', 'squash', 'Sports & Games'),
  ('softball', 'kickboxing', 'Sports & Games'),
  ('chair', 'stool', 'Household Objects'),
  ('table', 'desk', 'Household Objects'),
  ('sofa', 'loveseat', 'Household Objects'),
  ('bed', 'bunk', 'Household Objects'),
  ('pillow', 'cushion', 'Household Objects'),
  ('blanket', 'quilt', 'Household Objects'),
  ('mattress', 'futon', 'Household Objects'),
  ('lamp', 'lantern', 'Household Objects'),
  ('mirror', 'window', 'Household Objects'),
  ('curtain', 'blind', 'Household Objects'),
  ('carpet', 'rug', 'Household Objects'),
  ('clock', 'timer', 'Household Objects'),
  ('shelf', 'cabinet', 'Household Objects'),
  ('drawer', 'closet', 'Household Objects'),
  ('door', 'gate', 'Household Objects'),
  ('key', 'lock', 'Household Objects'),
  ('broom', 'mop', 'Household Objects'),
  ('vacuum', 'duster', 'Household Objects'),
  ('bucket', 'basin', 'Household Objects'),
  ('sponge', 'cloth', 'Household Objects'),
  ('soap', 'detergent', 'Household Objects'),
  ('towel', 'napkin', 'Household Objects'),
  ('toothbrush', 'comb', 'Household Objects'),
  ('razor', 'scissors', 'Household Objects'),
  ('kettle', 'teapot', 'Household Objects'),
  ('mug', 'glass', 'Household Objects'),
  ('plate', 'bowl', 'Household Objects'),
  ('fork', 'spoon', 'Household Objects'),
  ('knife', 'peeler', 'Household Objects'),
  ('pan', 'pot', 'Household Objects'),
  ('oven', 'microwave', 'Household Objects'),
  ('fridge', 'freezer', 'Household Objects'),
  ('dishwasher', 'washing machine', 'Household Objects'),
  ('blender', 'food processor', 'Household Objects'),
  ('toaster', 'grill', 'Household Objects'),
  ('candle', 'incense', 'Household Objects'),
  ('vase', 'pot plant', 'Household Objects'),
  ('picture frame', 'poster', 'Household Objects'),
  ('bin', 'recycling box', 'Household Objects'),
  ('ladder', 'step stool', 'Household Objects'),
  ('hammer', 'mallet', 'Household Objects'),
  ('screwdriver', 'wrench', 'Household Objects'),
  ('nail', 'screw', 'Household Objects'),
  ('tape', 'glue', 'Household Objects'),
  ('rope', 'chain', 'Household Objects'),
  ('umbrella', 'raincoat', 'Household Objects'),
  ('flashlight', 'headlamp', 'Household Objects'),
  ('battery', 'charger', 'Household Objects'),
  ('thermostat', 'radiator', 'Household Objects'),
  ('fan', 'air conditioner', 'Household Objects'),
  ('iron', 'steamer', 'Household Objects'),
  ('hanger', 'hook', 'Household Objects'),
  ('car', 'van', 'Travel & Transport'),
  ('bus', 'coach', 'Travel & Transport'),
  ('train', 'tram', 'Travel & Transport'),
  ('bicycle', 'tricycle', 'Travel & Transport'),
  ('motorcycle', 'moped', 'Travel & Transport'),
  ('truck', 'lorry', 'Travel & Transport'),
  ('taxi', 'rideshare', 'Travel & Transport'),
  ('boat', 'yacht', 'Travel & Transport'),
  ('ship', 'ferry', 'Travel & Transport'),
  ('canoe', 'raft', 'Travel & Transport'),
  ('submarine', 'torpedo', 'Travel & Transport'),
  ('airplane', 'glider', 'Travel & Transport'),
  ('helicopter', 'drone', 'Travel & Transport'),
  ('hot air balloon', 'blimp', 'Travel & Transport'),
  ('rocket', 'space shuttle', 'Travel & Transport'),
  ('skateboard', 'scooter', 'Travel & Transport'),
  ('sled', 'toboggan', 'Travel & Transport'),
  ('wheelchair', 'walker', 'Travel & Transport'),
  ('stroller', 'wagon', 'Travel & Transport'),
  ('caravan', 'camper van', 'Travel & Transport'),
  ('tractor', 'bulldozer', 'Travel & Transport'),
  ('ambulance', 'fire truck', 'Travel & Transport'),
  ('limousine', 'hearse', 'Travel & Transport'),
  ('cable car', 'chairlift', 'Travel & Transport'),
  ('escalator', 'moving walkway', 'Travel & Transport'),
  ('passport', 'visa', 'Travel & Transport'),
  ('suitcase', 'backpack', 'Travel & Transport'),
  ('map', 'compass', 'Travel & Transport'),
  ('ticket', 'boarding pass', 'Travel & Transport'),
  ('highway', 'country road', 'Travel & Transport'),
  ('roundabout', 'junction', 'Travel & Transport'),
  ('traffic light', 'stop sign', 'Travel & Transport'),
  ('crosswalk', 'footbridge', 'Travel & Transport'),
  ('toll booth', 'checkpoint', 'Travel & Transport'),
  ('runway', 'taxiway', 'Travel & Transport'),
  ('platform', 'waiting room', 'Travel & Transport'),
  ('seatbelt', 'airbag', 'Travel & Transport'),
  ('steering wheel', 'handlebar', 'Travel & Transport'),
  ('engine', 'motor', 'Travel & Transport'),
  ('tire', 'wheel', 'Travel & Transport'),
  ('fuel', 'charging cable', 'Travel & Transport'),
  ('anchor', 'mooring', 'Travel & Transport'),
  ('sail', 'oar', 'Travel & Transport'),
  ('cockpit', 'bridge deck', 'Travel & Transport'),
  ('luggage rack', 'glove box', 'Travel & Transport'),
  ('windshield', 'sunroof', 'Travel & Transport'),
  ('rain', 'drizzle', 'Nature & Weather'),
  ('snow', 'sleet', 'Nature & Weather'),
  ('hail', 'frost', 'Nature & Weather'),
  ('thunder', 'lightning', 'Nature & Weather'),
  ('storm', 'hurricane', 'Nature & Weather'),
  ('tornado', 'whirlwind', 'Nature & Weather'),
  ('fog', 'mist', 'Nature & Weather'),
  ('cloud', 'haze', 'Nature & Weather'),
  ('wind', 'breeze', 'Nature & Weather'),
  ('sunshine', 'heatwave', 'Nature & Weather'),
  ('rainbow', 'aurora', 'Nature & Weather'),
  ('earthquake', 'landslide', 'Nature & Weather'),
  ('volcano', 'geyser', 'Nature & Weather'),
  ('flood', 'tsunami', 'Nature & Weather'),
  ('drought', 'famine', 'Nature & Weather'),
  ('wildfire', 'smoke', 'Nature & Weather'),
  ('mountain', 'hill', 'Nature & Weather'),
  ('valley', 'gorge', 'Nature & Weather'),
  ('river', 'stream', 'Nature & Weather'),
  ('lake', 'pond', 'Nature & Weather'),
  ('ocean', 'sea', 'Nature & Weather'),
  ('waterfall', 'rapids', 'Nature & Weather'),
  ('glacier', 'iceberg', 'Nature & Weather'),
  ('forest', 'woodland', 'Nature & Weather'),
  ('jungle', 'rainforest', 'Nature & Weather'),
  ('swamp', 'marsh', 'Nature & Weather'),
  ('meadow', 'prairie', 'Nature & Weather'),
  ('cliff', 'ridge', 'Nature & Weather'),
  ('cave', 'grotto', 'Nature & Weather'),
  ('dune', 'sandbar', 'Nature & Weather'),
  ('reef', 'atoll', 'Nature & Weather'),
  ('tree', 'shrub', 'Nature & Weather'),
  ('flower', 'blossom', 'Nature & Weather'),
  ('grass', 'moss', 'Nature & Weather'),
  ('leaf', 'petal', 'Nature & Weather'),
  ('root', 'stem', 'Nature & Weather'),
  ('seed', 'sprout', 'Nature & Weather'),
  ('branch', 'twig', 'Nature & Weather'),
  ('bark', 'trunk', 'Nature & Weather'),
  ('cactus', 'succulent', 'Nature & Weather'),
  ('fern', 'ivy', 'Nature & Weather'),
  ('rose', 'tulip', 'Nature & Weather'),
  ('sunflower', 'daisy', 'Nature & Weather'),
  ('oak', 'maple', 'Nature & Weather'),
  ('pine', 'spruce', 'Nature & Weather'),
  ('bamboo', 'reed', 'Nature & Weather'),
  ('sunrise', 'sunset', 'Nature & Weather'),
  ('moon', 'sun', 'Nature & Weather'),
  ('star', 'planet', 'Nature & Weather'),
  ('comet', 'meteor', 'Nature & Weather'),
  ('eclipse', 'solstice', 'Nature & Weather'),
  ('tide', 'current', 'Nature & Weather'),
  ('movie', 'documentary', 'Entertainment'),
  ('concert', 'festival', 'Entertainment'),
  ('stage play', 'musical', 'Entertainment'),
  ('opera', 'ballet', 'Entertainment'),
  ('circus', 'parade', 'Entertainment'),
  ('magic show', 'puppet show', 'Entertainment'),
  ('stand-up', 'improv', 'Entertainment'),
  ('podcast', 'radio show', 'Entertainment'),
  ('audiobook', 'podcast series', 'Entertainment'),
  ('novel', 'memoir', 'Entertainment'),
  ('comic book', 'graphic novel', 'Entertainment'),
  ('newspaper', 'magazine', 'Entertainment'),
  ('cartoon', 'anime', 'Entertainment'),
  ('sitcom', 'soap opera', 'Entertainment'),
  ('thriller', 'mystery', 'Entertainment'),
  ('horror', 'suspense', 'Entertainment'),
  ('comedy', 'parody', 'Entertainment'),
  ('romance', 'drama', 'Entertainment'),
  ('western', 'war film', 'Entertainment'),
  ('science fiction', 'fantasy', 'Entertainment'),
  ('video game', 'board game', 'Entertainment'),
  ('arcade game', 'pinball', 'Entertainment'),
  ('karaoke', 'open mic', 'Entertainment'),
  ('guitar', 'banjo', 'Entertainment'),
  ('piano', 'organ', 'Entertainment'),
  ('violin', 'cello', 'Entertainment'),
  ('drums', 'bongos', 'Entertainment'),
  ('flute', 'clarinet', 'Entertainment'),
  ('trumpet', 'trombone', 'Entertainment'),
  ('saxophone', 'harmonica', 'Entertainment'),
  ('harp', 'lyre', 'Entertainment'),
  ('accordion', 'bagpipes', 'Entertainment'),
  ('choir', 'band', 'Entertainment'),
  ('orchestra', 'quartet', 'Entertainment'),
  ('dj', 'producer', 'Entertainment'),
  ('album', 'single', 'Entertainment'),
  ('headphones', 'earbuds', 'Entertainment'),
  ('speaker', 'amplifier', 'Entertainment'),
  ('microphone', 'megaphone', 'Entertainment'),
  ('stage', 'backstage', 'Entertainment'),
  ('audience', 'crowd', 'Entertainment'),
  ('ticket booth', 'box office', 'Entertainment'),
  ('popcorn stand', 'snack bar', 'Entertainment'),
  ('red carpet', 'runway show', 'Entertainment'),
  ('trailer', 'teaser', 'Entertainment'),
  ('sequel', 'remake', 'Entertainment'),
  ('computer', 'laptop', 'Technology'),
  ('tablet', 'e-reader', 'Technology'),
  ('smartphone', 'flip phone', 'Technology'),
  ('smartwatch', 'fitness tracker', 'Technology'),
  ('keyboard', 'keypad', 'Technology'),
  ('monitor', 'projector', 'Technology'),
  ('printer', 'scanner', 'Technology'),
  ('router', 'modem', 'Technology'),
  ('hard drive', 'flash drive', 'Technology'),
  ('server', 'mainframe', 'Technology'),
  ('database', 'spreadsheet', 'Technology'),
  ('website', 'web app', 'Technology'),
  ('email', 'text message', 'Technology'),
  ('password', 'passcode', 'Technology'),
  ('firewall', 'antivirus', 'Technology'),
  ('browser', 'search engine', 'Technology'),
  ('app store', 'software update', 'Technology'),
  ('cloud storage', 'backup drive', 'Technology'),
  ('robot', 'android', 'Technology'),
  ('drone camera', 'dash cam', 'Technology'),
  ('satellite', 'space station', 'Technology'),
  ('telescope', 'binoculars', 'Technology'),
  ('microscope', 'magnifier', 'Technology'),
  ('calculator', 'abacus', 'Technology'),
  ('camera', 'camcorder', 'Technology'),
  ('television', 'projector screen', 'Technology'),
  ('remote control', 'game controller', 'Technology'),
  ('console', 'handheld', 'Technology'),
  ('virtual reality', 'augmented reality', 'Technology'),
  ('artificial intelligence', 'machine learning', 'Technology'),
  ('algorithm', 'formula', 'Technology'),
  ('bug', 'glitch', 'Technology'),
  ('code', 'script', 'Technology'),
  ('network', 'intranet', 'Technology'),
  ('bluetooth', 'wifi', 'Technology'),
  ('usb cable', 'power cord', 'Technology'),
  ('solar panel', 'wind turbine', 'Technology'),
  ('battery pack', 'generator', 'Technology'),
  ('barcode', 'qr code', 'Technology'),
  ('touchscreen', 'trackpad', 'Technology'),
  ('headset', 'webcam', 'Technology'),
  ('sensor', 'detector', 'Technology'),
  ('3d printer', 'laser cutter', 'Technology'),
  ('elevator button', 'keycard', 'Technology'),
  ('shirt', 'blouse', 'Clothing'),
  ('t-shirt', 'tank top', 'Clothing'),
  ('sweater', 'cardigan', 'Clothing'),
  ('hoodie', 'sweatshirt', 'Clothing'),
  ('jacket', 'blazer', 'Clothing'),
  ('coat', 'parka', 'Clothing'),
  ('vest', 'waistcoat', 'Clothing'),
  ('trousers', 'chinos', 'Clothing'),
  ('jeans', 'corduroys', 'Clothing'),
  ('shorts', 'capris', 'Clothing'),
  ('skirt', 'dress', 'Clothing'),
  ('gown', 'robe', 'Clothing'),
  ('suit', 'tuxedo', 'Clothing'),
  ('uniform', 'overalls', 'Clothing'),
  ('pyjamas', 'nightgown', 'Clothing'),
  ('swimsuit', 'wetsuit', 'Clothing'),
  ('socks', 'stockings', 'Clothing'),
  ('shoes', 'sneakers', 'Clothing'),
  ('boots', 'wellingtons', 'Clothing'),
  ('sandals', 'flip flops', 'Clothing'),
  ('heels', 'flats', 'Clothing'),
  ('slippers', 'moccasins', 'Clothing'),
  ('hat', 'cap', 'Clothing'),
  ('beanie', 'beret', 'Clothing'),
  ('helmet', 'hard hat', 'Clothing'),
  ('scarf', 'shawl', 'Clothing'),
  ('gloves', 'mittens', 'Clothing'),
  ('belt', 'suspenders', 'Clothing'),
  ('tie', 'bow tie', 'Clothing'),
  ('necklace', 'pendant', 'Clothing'),
  ('bracelet', 'bangle', 'Clothing'),
  ('ring', 'signet', 'Clothing'),
  ('earrings', 'studs', 'Clothing'),
  ('watch', 'wristband', 'Clothing'),
  ('sunglasses', 'goggles', 'Clothing'),
  ('handbag', 'clutch', 'Clothing'),
  ('wallet', 'purse', 'Clothing'),
  ('apron', 'smock', 'Clothing'),
  ('raincoat', 'poncho', 'Clothing'),
  ('kimono', 'sarong', 'Clothing'),
  ('turban', 'headscarf', 'Clothing'),
  ('cufflinks', 'brooch', 'Clothing'),
  ('zipper', 'button', 'Clothing'),
  ('pocket', 'cuff', 'Clothing'),
  ('head', 'skull', 'Body & Health'),
  ('hair', 'beard', 'Body & Health'),
  ('eye', 'eyebrow', 'Body & Health'),
  ('ear', 'earlobe', 'Body & Health'),
  ('nose', 'nostril', 'Body & Health'),
  ('mouth', 'lips', 'Body & Health'),
  ('tooth', 'gum', 'Body & Health'),
  ('tongue', 'palate', 'Body & Health'),
  ('chin', 'jaw', 'Body & Health'),
  ('neck', 'throat', 'Body & Health'),
  ('shoulder', 'collarbone', 'Body & Health'),
  ('arm', 'forearm', 'Body & Health'),
  ('elbow', 'wrist', 'Body & Health'),
  ('hand', 'palm', 'Body & Health'),
  ('finger', 'thumb', 'Body & Health'),
  ('fingernail', 'cuticle', 'Body & Health'),
  ('chest', 'ribcage', 'Body & Health'),
  ('stomach', 'abdomen', 'Body & Health'),
  ('back', 'spine', 'Body & Health'),
  ('hip', 'pelvis', 'Body & Health'),
  ('leg', 'thigh', 'Body & Health'),
  ('knee', 'shin', 'Body & Health'),
  ('ankle', 'heel', 'Body & Health'),
  ('foot', 'toe', 'Body & Health'),
  ('heart', 'lung', 'Body & Health'),
  ('brain', 'nerve', 'Body & Health'),
  ('liver', 'kidney', 'Body & Health'),
  ('muscle', 'tendon', 'Body & Health'),
  ('bone', 'cartilage', 'Body & Health'),
  ('skin', 'pore', 'Body & Health'),
  ('blood', 'plasma', 'Body & Health'),
  ('vein', 'artery', 'Body & Health'),
  ('headache', 'migraine', 'Body & Health'),
  ('cough', 'sneeze', 'Body & Health'),
  ('fever', 'chills', 'Body & Health'),
  ('common cold', 'flu', 'Body & Health'),
  ('allergy', 'rash', 'Body & Health'),
  ('bruise', 'scar', 'Body & Health'),
  ('sprain', 'fracture', 'Body & Health'),
  ('bandage', 'plaster', 'Body & Health'),
  ('stitches', 'cast', 'Body & Health'),
  ('vitamin', 'supplement', 'Body & Health'),
  ('vaccine', 'booster', 'Body & Health'),
  ('checkup', 'screening', 'Body & Health'),
  ('surgery', 'operation', 'Body & Health'),
  ('x-ray', 'ultrasound', 'Body & Health'),
  ('prescription', 'dosage', 'Body & Health'),
  ('stethoscope', 'thermometer', 'Body & Health'),
  ('crutches', 'walking stick', 'Body & Health'),
  ('pencil', 'pen', 'School & Office'),
  ('eraser', 'correction fluid', 'School & Office'),
  ('ruler', 'protractor', 'School & Office'),
  ('notebook', 'journal', 'School & Office'),
  ('textbook', 'workbook', 'School & Office'),
  ('pencil case', 'lunchbox', 'School & Office'),
  ('blackboard', 'whiteboard', 'School & Office'),
  ('chalk', 'marker', 'School & Office'),
  ('homework', 'assignment', 'School & Office'),
  ('exam', 'quiz', 'School & Office'),
  ('grade', 'score', 'School & Office'),
  ('diploma', 'certificate', 'School & Office'),
  ('lecture', 'seminar', 'School & Office'),
  ('timetable', 'syllabus', 'School & Office'),
  ('detention', 'suspension', 'School & Office'),
  ('recess', 'lunch break', 'School & Office'),
  ('field trip', 'excursion', 'School & Office'),
  ('graduation', 'prom', 'School & Office'),
  ('scholarship', 'grant', 'School & Office'),
  ('dormitory', 'boarding house', 'School & Office'),
  ('stapler', 'hole punch', 'School & Office'),
  ('paperclip', 'binder clip', 'School & Office'),
  ('folder', 'binder', 'School & Office'),
  ('envelope', 'postcard', 'School & Office'),
  ('calendar', 'planner', 'School & Office'),
  ('sticky note', 'index card', 'School & Office'),
  ('whiteboard eraser', 'board duster', 'School & Office'),
  ('filing cabinet', 'safe', 'School & Office'),
  ('photocopier', 'fax machine', 'School & Office'),
  ('meeting', 'briefing', 'School & Office'),
  ('presentation', 'pitch', 'School & Office'),
  ('deadline', 'milestone', 'School & Office'),
  ('resume', 'cover letter', 'School & Office'),
  ('interview', 'appraisal', 'School & Office'),
  ('promotion', 'raise', 'School & Office'),
  ('contract', 'agreement', 'School & Office'),
  ('invoice', 'receipt', 'School & Office'),
  ('budget', 'forecast', 'School & Office'),
  ('payroll', 'timesheet', 'School & Office'),
  ('cubicle', 'workstation', 'School & Office'),
  ('coffee break', 'water cooler', 'School & Office'),
  ('overtime', 'night shift', 'School & Office'),
  ('intern', 'apprentice', 'School & Office'),
  ('colleague', 'supervisor', 'School & Office'),
  ('badge', 'lanyard', 'School & Office'),
  ('meeting minutes', 'agenda', 'School & Office');

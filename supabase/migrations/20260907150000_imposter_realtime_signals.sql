-- Realtime: tell a room that something changed, and nothing else.
--
-- The obvious way to make this game live is Postgres Changes -- subscribe to
-- game_clues, game_votes and the rest, and render the rows that arrive. This
-- does not do that, on purpose.
--
-- Postgres Changes ships the row itself down the socket and relies on Realtime's
-- own RLS evaluation to decide who may see it. That is a second, differently
-- implemented copy of the access control this schema spent three migrations
-- getting right, applied to exactly the rows that must not leak -- a ballot
-- during a live vote, an imposter's secret. One gap in that second path and the
-- game is over, silently, with no error anyone would notice.
--
-- So the socket carries a doorbell, not the data. Each trigger sends a payload
-- naming only the table that changed; the client's response is to re-run the
-- ordinary server render, which reads through the same RLS-scoped queries it
-- always did. There is exactly one path by which game data reaches a player, and
-- Realtime is not it.
--
-- The channel is private, so `realtime.messages` needs a policy to authorize a
-- listener. It sits at the bottom of this file. Without it a private channel
-- authorizes nobody and the app silently falls back to polling -- which is the
-- correct failure mode, and is why the poller stays.

-- Parse a room id out of a channel topic, or null if the topic is not ours.
--
-- Separate from the policy because the policy would otherwise cast arbitrary
-- client-supplied text to uuid. A malformed topic would raise inside policy
-- evaluation rather than simply denying, and SQL does not promise that the
-- regex guard in an AND is evaluated before the cast.
create or replace function public.game_topic_room(p_topic text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_topic is null or p_topic !~ '^game:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return null;
  end if;

  return substring(p_topic from 6)::uuid;
exception when others then
  return null;
end;
$$;

comment on function public.game_topic_room(text) is
  'The room id inside a game:<uuid> realtime topic, or null for anything else.';

create or replace function public.broadcast_game_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed record;
  target_room uuid;
begin
  if tg_op = 'DELETE' then
    changed := old;
  else
    changed := new;
  end if;

  if tg_table_name = 'game_rooms' then
    target_room := changed.id;
  elsif tg_table_name in ('game_room_players', 'game_rounds') then
    target_room := changed.room_id;
  else
    select room_id into target_room from public.game_rounds where id = changed.round_id;
  end if;

  if target_room is not null then
    -- The table name and nothing else. Enough for a client to know a refresh is
    -- worth doing; not enough to learn anything it could not already read.
    perform realtime.send(
      jsonb_build_object('table', tg_table_name, 'op', tg_op),
      'changed',
      'game:' || target_room::text,
      true
    );
  end if;

  return null;
end;
$$;

comment on function public.broadcast_game_change() is
  'AFTER trigger. Rings the room''s realtime channel with the changed table name and no row data.';

create trigger game_rooms_broadcast
after insert or update or delete on public.game_rooms
for each row execute procedure public.broadcast_game_change();

create trigger game_room_players_broadcast
after insert or update or delete on public.game_room_players
for each row execute procedure public.broadcast_game_change();

create trigger game_rounds_broadcast
after insert or update or delete on public.game_rounds
for each row execute procedure public.broadcast_game_change();

create trigger game_clues_broadcast
after insert or update or delete on public.game_clues
for each row execute procedure public.broadcast_game_change();

create trigger game_votes_broadcast
after insert or update or delete on public.game_votes
for each row execute procedure public.broadcast_game_change();

-- Deliberately no trigger on game_round_secrets. Those rows are written once at
-- deal time and never change, and a broadcast keyed to them would announce the
-- moment roles were assigned to anyone listening.

revoke execute on function public.broadcast_game_change() from public, anon, authenticated;
revoke execute on function public.game_topic_room(text) from public, anon;
-- The policy below calls this, and a policy is evaluated as the querying user.
grant execute on function public.game_topic_room(text) to authenticated;

-- Who may listen on a game channel.
--
-- SELECT authorizes *receiving* a broadcast. There is deliberately no INSERT
-- policy: a client that could insert into realtime.messages could broadcast on
-- the room's channel itself, and while the payload is inert, a player who can
-- make everyone else's screen refresh on demand is a nuisance nobody needs.
-- Only the triggers above, running as the definer, put messages on this channel.
create policy "players receive their own room's signals" on realtime.messages
  for select
  to authenticated
  using (public.is_game_room_member(public.game_topic_room(realtime.topic())));

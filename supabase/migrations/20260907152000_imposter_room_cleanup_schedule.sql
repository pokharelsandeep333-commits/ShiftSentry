-- Run the room cleanup every half hour.
--
-- Alone in its own migration because it is the only thing in this feature that
-- changes the project rather than the schema: `pg_cron` is a database-wide
-- extension, and enabling it is a decision about the project, not about the
-- game. Delete this file and everything else still works -- rooms just accumulate
-- until somebody calls `cleanup_stale_game_rooms` by hand or schedules it from
-- the dashboard.
--
-- The whole thing is wrapped so a failure warns instead of aborting the
-- migration. pg_cron can only be installed into the database named in
-- `cron.database_name`, needs privileges a project may not grant, and on a
-- self-hosted or branch database may not exist at all. None of that is worth
-- failing a deploy over: the cleanup is housekeeping, and the release that
-- carries it also carries the game itself.
--
-- EXECUTE rather than plain statements because plpgsql cannot parse CREATE
-- EXTENSION directly, and because `cron.schedule` does not resolve at parse time
-- when the extension is not installed yet.
do $$
begin
  execute 'create extension if not exists pg_cron';

  execute $cmd$
    select cron.schedule(
      'shiftsentry-end-stale-game-rooms',
      '*/30 * * * *',
      'select public.cleanup_stale_game_rooms()'
    )
  $cmd$;

  raise notice 'Scheduled shiftsentry-end-stale-game-rooms every 30 minutes.';
exception when others then
  raise warning 'Could not schedule game room cleanup: %. cleanup_stale_game_rooms() still exists and can be scheduled from the Supabase dashboard.', sqlerrm;
end;
$$;

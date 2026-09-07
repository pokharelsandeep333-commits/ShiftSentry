-- Adds the DISCUSSION phase: an explicit pause between the last clue and the
-- vote, where the vote buttons are locked so people talk before anyone commits.
-- Optional, per room.
--
-- Alone in its own migration for the same reason GUESSING was in
-- 20260907135000: Postgres allows ALTER TYPE ... ADD VALUE inside a
-- transaction but refuses to let the new value be *used* in that same
-- transaction, and the migration next door names 'DISCUSSION' in check
-- constraints and function bodies that are parsed at creation.

alter type public.game_round_status add value 'DISCUSSION' before 'VOTING';

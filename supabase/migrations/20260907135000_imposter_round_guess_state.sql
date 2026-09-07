-- Adds the GUESSING phase to the round state machine: a caught imposter who is
-- allowed a final guess sits here between the vote and the reveal, because the
-- round is decided but the word is not yet public.
--
-- Alone in its own migration, and it has to be. Postgres allows ALTER TYPE ...
-- ADD VALUE inside a transaction, but refuses to let the new value be *used* in
-- the same one -- "unsafe use of new value". The round-loop migration next door
-- names 'GUESSING' in a policy expression, which is DDL and is checked at
-- creation, so the two cannot share a file: the Supabase CLI runs each migration
-- in a transaction, and this one has to commit before the other is parsed.
--
-- (A plpgsql function body would have been fine -- bodies are stored as text and
-- resolved at execution. It is the policy that forces the split.)

alter type public.game_round_status add value 'GUESSING' before 'REVEAL';

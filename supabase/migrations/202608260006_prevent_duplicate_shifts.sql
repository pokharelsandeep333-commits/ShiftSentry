-- Reject a second shift with the same job and the exact same span for one
-- user. A fast double-click on the shift form could slip past the client-side
-- pending guard and insert the row twice, silently doubling logged hours and
-- earnings. The weekly-limit trigger only catches this when a cap is set, so
-- an uncapped job had no protection at all.
--
-- Deliberately narrow: only an exact (user, job, start, end) match is blocked.
-- Overlapping or adjacent shifts on the same job remain legal.

create unique index shifts_no_duplicate_span
  on public.shifts (user_id, job_id, starts_at, ends_at);

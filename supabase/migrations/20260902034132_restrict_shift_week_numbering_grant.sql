-- Follow-up to 20260902034021_shift_week_numbering.
--
-- That migration did `revoke execute ... from public`, on the assumption that
-- PUBLIC was the only thing granting the new function to anon. It is not: this
-- project carries default privileges that grant execute on new public functions
-- to anon, authenticated and service_role explicitly, so revoking PUBLIC left
-- anon's own grant untouched.
--
-- Nothing leaked -- the function is security invoker, so an anonymous caller
-- hits the "users manage own shifts" RLS policy with a null auth.uid() and
-- counts zero rows. But the previous migration's comment claimed anon could not
-- call it, and that should be true rather than merely harmless.

revoke execute on function public.shift_week_count_before(text, integer, timestamptz) from anon;

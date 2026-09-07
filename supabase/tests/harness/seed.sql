-- Five signed-up people, referred to by these fixed ids throughout the suites.
--
-- Inserting into auth.users is what creates the matching public.profiles row --
-- the handle_new_user trigger from the initial schema does that -- so this also
-- exercises that trigger on every run.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com'),
  ('33333333-3333-3333-3333-333333333333', 'carol@example.com'),
  ('44444444-4444-4444-4444-444444444444', 'dave@example.com'),
  ('55555555-5555-5555-5555-555555555555', 'erin@example.com')
on conflict (id) do nothing;

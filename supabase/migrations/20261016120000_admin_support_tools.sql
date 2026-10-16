-- Admin support tools: end a user's sessions, and private support notes.
--
-- Both are reached only through the server (the service role or the owner
-- connection Prisma uses). No API role can call the function or touch the
-- table, and every use is written to audit_events by the action that makes it.

-- ---------------------------------------------------------------------------
-- Sign a user out everywhere.
--
-- The Auth admin API can only sign out the session whose JWT it is given, so
-- an admin acting on someone else's account deletes their sessions here.
-- auth.refresh_tokens references auth.sessions ON DELETE CASCADE, so no
-- session can be refreshed afterwards. An access token already issued stays
-- valid until it expires (an hour at most); disabling the account is what
-- stops writes at once, and the admin page says so.
-- ---------------------------------------------------------------------------
create function public.admin_revoke_user_sessions(p_user_id uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare removed integer;
begin
  delete from auth.sessions where user_id = p_user_id;
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke execute on function public.admin_revoke_user_sessions(uuid) from public, anon, authenticated;
grant execute on function public.admin_revoke_user_sessions(uuid) to service_role;

comment on function public.admin_revoke_user_sessions(uuid) is
  'Server only. Ends every session of one user (refresh tokens cascade). Audited by the calling action.';

-- ---------------------------------------------------------------------------
-- Support notes: what support needs to remember about an account.
--
-- Personal data about the user, so it is removed with the account (cascade
-- from profiles) and included in their export below. The author is kept for
-- admins but left out of the export, and is cleared if that admin's own
-- account is deleted.
-- ---------------------------------------------------------------------------
create table public.admin_user_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null constraint admin_user_notes_body_length check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index admin_user_notes_user_created on public.admin_user_notes (user_id, created_at desc);
-- Indexes the ON DELETE SET NULL lookup when an admin's account is deleted.
create index admin_user_notes_author on public.admin_user_notes (author_id);

-- RLS on with no policy: no API role may read or write a note, whatever the
-- grants below say. Only the server's owner connection and service role,
-- which bypass RLS, reach it.
alter table public.admin_user_notes enable row level security;
revoke all on table public.admin_user_notes from public, anon, authenticated;
grant select, insert, delete on table public.admin_user_notes to service_role;

-- The same agreement and account-state guard as every other table of personal
-- data. It only ever applies to a write with a user claim, which this table
-- cannot receive; it is here so the rule "every personal-data table has it"
-- stays true without exceptions.
create trigger require_current_legal_agreement before insert or update or delete on public.admin_user_notes
  for each row execute function public.require_legal_write();

comment on table public.admin_user_notes is
  'Admin-only support notes about an account. Removed with the account; included in export_account_data() without the author.';

-- ---------------------------------------------------------------------------
-- The export gains supportNotes. Unchanged otherwise from
-- 20261015120000_job_pay_schedules.sql.
-- ---------------------------------------------------------------------------
create or replace function public.export_account_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); result jsonb;
begin
  if actor is null or not exists(select 1 from public.profiles where id = actor) then raise exception 'Sign in to export your account.'; end if;
  select jsonb_build_object(
    'schemaVersion', 1, 'exportedAt', now(),
    'profile', (select to_jsonb(p) from (select id,email,display_name,role,time_zone,week_starts_on,global_weekly_limit_minutes,disabled_at,deletion_pending_at,created_at,updated_at from public.profiles where id = actor) p),
    'jobs', coalesce((select jsonb_agg(to_jsonb(j) order by j.id) from (select id,user_id,name,color,weekly_limit_minutes,hourly_rate_cents,tax_rate_basis_points,archived_at,google_keyword,google_calendar_id,google_sync,google_sync_ignored,pay_schedule,pay_interval_weeks,pay_anchor_date,pay_month_day,payday_offset_days,created_at,updated_at from public.jobs where user_id = actor) j),'[]'::jsonb),
    'deductions', coalesce((select jsonb_agg(to_jsonb(d) order by d.id) from (select d.id,d.job_id,d.name,d.rate_basis_points,d.created_at,d.updated_at from public.job_deductions d join public.jobs j on j.id = d.job_id where j.user_id = actor) d),'[]'::jsonb),
    'shifts', coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from (select id,user_id,job_id,starts_at,ends_at,notes,hourly_rate_cents,tax_rate_basis_points,deductions_snapshot,gross_cents,tax_cents,deduction_cents,net_cents,google_calendar_id,google_event_id,google_adopted,created_at,updated_at from public.shifts where user_id = actor) s),'[]'::jsonb),
    'weekNotes', coalesce((select jsonb_agg(to_jsonb(n) order by n.week_start) from (select id,user_id,week_start,body,created_at,updated_at from public.week_notes where user_id = actor) n),'[]'::jsonb),
    'agreements', coalesce((select jsonb_agg(to_jsonb(a) order by a.accepted_at) from (select version,accepted_at from public.legal_acceptances where user_id = actor) a),'[]'::jsonb),
    'calendarSettings', (select to_jsonb(c) from (select google_email,scopes,selected_calendar_ids,status,created_at,updated_at from public.google_calendar_connections where user_id = actor) c),
    'gameMemberships', coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from (select id,room_id,display_name,joined_at,last_seen_at from public.game_room_players where user_id = actor) m),'[]'::jsonb),
    'gameParticipation', coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from (select id,round_id,turn_order,eliminated_at from public.game_round_players where user_id = actor) p),'[]'::jsonb),
    'gameClues', coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from (select id,round_id,pass_no,clue,created_at from public.game_clues where user_id = actor) c),'[]'::jsonb),
    'gameVotes', coalesce((select jsonb_agg(to_jsonb(v) order by v.id) from (select id,round_id,target_id,created_at from public.game_votes where voter_id = actor) v),'[]'::jsonb),
    'hostedRooms', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from (select id,status,decoy_mode,category_hint,imposter_final_guess,imposter_count,clue_passes,max_players,category_filter,imposter_hint,hide_roles,ban_repeat_clues,discussion_phase,word_difficulty,created_at,updated_at,ended_at from public.game_rooms where host_id = actor) r),'[]'::jsonb),
    'gameFinalGuesses', coalesce((select jsonb_agg(to_jsonb(g) order by g.id) from (select id,final_guess,ended_at from public.game_rounds where caught_user_id = actor and final_guess is not null) g),'[]'::jsonb),
    'supportNotes', coalesce((select jsonb_agg(to_jsonb(s) order by s.created_at) from (select id,body,created_at from public.admin_user_notes where user_id = actor) s),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke execute on function public.export_account_data() from public, anon;
grant execute on function public.export_account_data() to authenticated;

-- shift_timers (20261117120000) and break_periods (20261118045051) each
-- redefined export_account_data() to add their own table. Applied in order,
-- the break-period definition replaced the timer one and dropped
-- 'shiftTimer'. This definition carries both.
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
    'shiftTimer', (select to_jsonb(t) from (select job_id,started_at,shift_id from public.shift_timers where user_id = actor) t),
    'breakPeriods', coalesce((select jsonb_agg(to_jsonb(b) order by b.start_date) from (select id,user_id,start_date,end_date,weekly_limit_minutes,label,created_at,updated_at from public.break_periods where user_id = actor) b),'[]'::jsonb),
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

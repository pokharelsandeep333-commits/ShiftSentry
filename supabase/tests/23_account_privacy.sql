\set ON_ERROR_STOP on
begin;

insert into auth.users(id,email) values
  ('6a000000-0000-4000-8000-000000000001','privacy-owner@example.com'),
  ('6a000000-0000-4000-8000-000000000002','privacy-other@example.com');

do $$
declare
  owner_id constant uuid := '6a000000-0000-4000-8000-000000000001';
  other_id constant uuid := '6a000000-0000-4000-8000-000000000002';
  refused boolean; before_accept timestamptz; after_accept timestamptz; exported jsonb;
  room_code text; room_id uuid;
begin
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  if public.has_current_legal_acceptance() then raise exception 'new user was implicitly accepted'; end if;
  refused := false;
  begin insert into public.jobs(user_id,name) values(owner_id,'Bypassed checkbox'); exception when others then refused := true; end;
  if not refused then raise exception 'direct write bypassed Terms'; end if;
  refused := false;
  begin perform public.create_game_room(); exception when others then refused := true; end;
  if not refused then raise exception 'game RPC bypassed Terms'; end if;
  refused := false;
  begin perform public.accept_legal_terms('forged',true,true); exception when others then refused := true; end;
  if not refused then raise exception 'forged agreement version accepted'; end if;
  refused := false;
  begin perform public.accept_legal_terms('2026-10-11.1',true,false); exception when others then refused := true; end;
  if not refused then raise exception 'missing eligibility confirmation accepted'; end if;
  refused := false;
  begin insert into public.legal_acceptances(user_id,version) values(other_id,'2026-10-11.1'); exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception 'caller could manufacture another account agreement'; end if;
  exported := public.export_account_data();
  if exported->'profile'->>'id' <> owner_id::text then raise exception 'pre-acceptance export is not scoped'; end if;
  perform public.accept_legal_terms('2026-10-11.1',true,true);
  select accepted_at into before_accept from public.legal_acceptances where user_id=owner_id;
  perform public.accept_legal_terms('2026-10-11.1',true,true);
  select accepted_at into after_accept from public.legal_acceptances where user_id=owner_id;
  if before_accept is distinct from after_accept then raise exception 'repeated acceptance rewrote evidence'; end if;
  if not public.has_current_legal_acceptance() then raise exception 'recorded agreement was not recognized'; end if;
  refused := false;
  begin update public.legal_acceptances set accepted_at='2000-01-01'; exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception 'user could rewrite timestamp'; end if;
  refused := false;
  begin perform public.prepare_account_deletion(other_id); exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception 'user could invoke admin deletion preparation'; end if;
  refused := false;
  begin perform public.purge_security_audit(); exception when insufficient_privilege then refused := true; end;
  if not refused then raise exception 'user could purge security evidence'; end if;
  room_code := public.create_game_room();
  select id into room_id from public.game_rooms where code=room_code;
  perform set_config('request.jwt.claim.sub',other_id::text,true);
  perform public.accept_legal_terms('2026-10-11.1',true,true);
  perform public.join_game_room(room_code);
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  insert into public.jobs(user_id,name) select owner_id,'Export job '||n from generate_series(1,1005) n;
  set local role postgres;
  perform set_config('request.jwt.claim.sub','',true);
  insert into public.jobs(user_id,name) values(other_id,'Other person private job');
  insert into public.google_calendar_connections(user_id,google_email,refresh_token_ciphertext,scopes)
    values(owner_id,'owner@gmail.com','MUST_NOT_EXPORT_TOKEN',array['read-only']);
  insert into public.shifts(user_id,job_id,starts_at,ends_at)
    select owner_id,id,'2035-01-01 10:00+00','2035-01-01 11:00+00' from public.jobs where user_id=owner_id limit 1;
  insert into public.week_notes(user_id,week_start,body) values(owner_id,'2035-01-01','My own note');
  insert into public.audit_events(actor_id,target_user_id,action,metadata)
    values(other_id,owner_id,'support.example',jsonb_build_object('email','privacy-owner@example.com','user_id',owner_id));
  -- The owner's final guess in somebody else's room is their contribution,
  -- while the dealt word and other players' submissions stay private.
  insert into public.game_rooms(host_id,code,status) values(other_id,'PPPQRS','PLAYING');
  insert into public.game_room_players(room_id,user_id,display_name)
    select id,owner_id,'Privacy player' from public.game_rooms where code='PPPQRS';
  insert into public.game_rounds(room_id,round_no,word_id,decoy_mode,category_hint,imposter_final_guess,imposter_count,clue_passes,caught_user_id,final_guess)
    select id,1,(select min(id) from public.game_words),false,false,true,1,1,owner_id,'my-final-guess' from public.game_rooms where code='PPPQRS';
  update public.game_rounds set status='GUESSING' where caught_user_id=owner_id;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  exported := public.export_account_data();
  if jsonb_array_length(exported->'jobs') <> 1005 then raise exception 'large export truncated'; end if;
  if exported::text like '%Other person private job%' or exported::text like '%MUST_NOT_EXPORT_TOKEN%' or exported::text like '%assigned_word%' then raise exception 'export contains other-user data or secrets'; end if;
  if jsonb_array_length(exported->'shifts') <> 1 or jsonb_array_length(exported->'weekNotes') <> 1 then raise exception 'export omitted work records'; end if;
  if jsonb_array_length(exported->'hostedRooms') <> 1 or exported->'gameFinalGuesses'->0->>'final_guess' <> 'my-final-guess' then raise exception 'export omitted own game contributions'; end if;
  set local role postgres;
  perform set_config('request.jwt.claim.sub','',true);
  perform public.prepare_account_deletion(owner_id);
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  refused := false;
  begin insert into public.jobs(user_id,name) values(owner_id,'Stale session'); exception when others then refused := true; end;
  if not refused then raise exception 'pending deletion admitted stale-session writes'; end if;
  exported := public.export_account_data();
  if jsonb_array_length(exported->'jobs') <> 1005 then raise exception 'privacy export unavailable while locked'; end if;
  set local role postgres;
  perform set_config('request.jwt.claim.sub','',true);
  delete from auth.users where id=owner_id;
  if exists(select 1 from public.jobs where user_id=owner_id) or exists(select 1 from public.shifts where user_id=owner_id)
    or exists(select 1 from public.week_notes where user_id=owner_id) or exists(select 1 from public.legal_acceptances where user_id=owner_id)
    or exists(select 1 from public.google_calendar_connections where user_id=owner_id) then raise exception 'account deletion left personal data'; end if;
  if exists(select 1 from public.game_rooms where id=room_id) then raise exception 'hosted room survived account deletion'; end if;
  if exists(select 1 from public.game_rounds where final_guess='my-final-guess') then raise exception 'deleted final guess survived in another host room'; end if;
  if exists(select 1 from public.game_rounds g where g.room_id in(select r.id from public.game_rooms r where r.code='PPPQRS') and g.status<>'REVEAL') then raise exception 'non-host deletion stranded a pending game guess'; end if;
  if exists(select 1 from public.audit_events where metadata::text like '%privacy-owner@example.com%') then raise exception 'deleted identifiers retained in audit JSON'; end if;
  if not exists(select 1 from public.profiles where id=other_id) then raise exception 'deletion removed another account'; end if;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  if public.has_current_legal_acceptance() then raise exception 'deleted user still accepted'; end if;
  refused := false;
  begin perform public.export_account_data(); exception when others then refused := true; end;
  if not refused then raise exception 'deleted token exported an account'; end if;
  set local role postgres;
  perform set_config('request.jwt.claim.sub','',true);
  insert into public.audit_events(action,created_at) values('old.retention',now()-interval '30 days 1 second'),('recent.retention',now()-interval '30 days');
  perform public.purge_security_audit();
  if exists(select 1 from public.audit_events where action='old.retention') or not exists(select 1 from public.audit_events where action='recent.retention') then raise exception '30-day retention boundary incorrect'; end if;
  insert into public.legal_versions(version,minimum_age,documents,published_at) values('future-test',16,'{}',now()+interval '1 day');
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',other_id::text,true);
  if public.has_current_legal_acceptance() then raise exception 'new version did not require renewed acceptance'; end if;
  refused := false;
  begin insert into public.jobs(user_id,name) values(other_id,'Old agreement'); exception when others then refused := true; end;
  if not refused then raise exception 'old agreement allowed a write'; end if;
  perform public.accept_legal_terms('future-test',true,true);
  if not public.has_current_legal_acceptance() then raise exception 'new version could not be accepted'; end if;
  raise notice 'explicit/versioned agreements, own-only large export, deletion cascades, stale tokens, and retention verified';
end;
$$;
rollback;

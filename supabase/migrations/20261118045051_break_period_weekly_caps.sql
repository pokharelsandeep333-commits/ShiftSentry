-- Both stored dates are inclusive. The local week-start date chooses the cap
-- for the whole week, even if the period ends before that week does.
create table public.break_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  weekly_limit_minutes integer not null check (weekly_limit_minutes between 1 and 10080),
  label text check (label is null or char_length(btrim(label)) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint break_periods_date_order check (
    start_date >= date '0001-01-01' and end_date <= date '9999-12-31' and start_date <= end_date
  ),
  constraint break_periods_no_overlap exclude using gist (
    user_id with =, daterange(start_date, end_date, '[]') with &&
  )
);

comment on table public.break_periods is
  'Inclusive local-date ranges. A week uses the override if its local week-start date is in the range.';

create trigger break_periods_updated_at before update on public.break_periods
  for each row execute function public.set_updated_at();

create trigger require_current_legal_agreement before insert or update or delete on public.break_periods
  for each row execute function public.require_legal_write();

alter table public.break_periods enable row level security;
revoke all on public.break_periods from public, anon, authenticated;
grant select, insert, update, delete on public.break_periods to authenticated;

create policy "users manage their own break periods" on public.break_periods
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "disabled accounts are locked out of break periods" on public.break_periods
  as restrictive for all to authenticated
  using ((select public.is_account_enabled()))
  with check ((select public.is_account_enabled()));


create or replace function public.enforce_shift_weekly_limits()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  user_time_zone text;
  user_week_starts_on integer;
  default_global_limit integer;
  global_limit integer;
  job_limit integer;
  week_start_date date;
  week_start_at timestamptz;
  week_end_at timestamptz;
  candidate_minutes integer;
  existing_global_minutes integer;
  existing_job_minutes integer;
begin
  if new.ends_at <= new.starts_at or new.ends_at - new.starts_at > interval '24 hours' then
    raise exception 'A shift must be longer than zero and no more than 24 hours.';
  end if;

  select time_zone, week_starts_on, global_weekly_limit_minutes
    into user_time_zone, user_week_starts_on, default_global_limit
    from public.profiles
    where id = new.user_id;

  if user_time_zone is null then
    raise exception 'User profile not found.';
  end if;

  select weekly_limit_minutes
    into job_limit
    from public.jobs
    where id = new.job_id
      and user_id = new.user_id;

  if not found then
    raise exception 'A shift must belong to one of your jobs.';
  end if;

  -- Serialize competing writes for this user so two individually valid shifts
  -- cannot race past a weekly cap.
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));

  week_start_date := (new.starts_at at time zone user_time_zone)::date
    - ((extract(dow from (new.starts_at at time zone user_time_zone))::integer - user_week_starts_on + 7) % 7);

  while (week_start_date::timestamp at time zone user_time_zone) < new.ends_at loop
    week_start_at := week_start_date::timestamp at time zone user_time_zone;
    week_end_at := (week_start_date + 7)::timestamp at time zone user_time_zone;
    candidate_minutes := round(extract(epoch from least(new.ends_at, week_end_at) - greatest(new.starts_at, week_start_at)) / 60)::integer;

    if candidate_minutes > 0 then
      select coalesce((
        select weekly_limit_minutes
        from public.break_periods
        where user_id = new.user_id
          and daterange(start_date, end_date, '[]') @> week_start_date
      ), default_global_limit) into global_limit;

      select coalesce(sum(round(extract(epoch from least(shifts.ends_at, week_end_at) - greatest(shifts.starts_at, week_start_at)) / 60)::integer), 0)
        into existing_global_minutes
        from public.shifts
        where user_id = new.user_id
          and id is distinct from new.id
          and starts_at < week_end_at
          and ends_at > week_start_at;

      if global_limit is not null and existing_global_minutes + candidate_minutes > global_limit then
        raise exception 'This shift exceeds your global weekly limit.';
      end if;

      select coalesce(sum(round(extract(epoch from least(shifts.ends_at, week_end_at) - greatest(shifts.starts_at, week_start_at)) / 60)::integer), 0)
        into existing_job_minutes
        from public.shifts
        where user_id = new.user_id
          and job_id = new.job_id
          and id is distinct from new.id
          and starts_at < week_end_at
          and ends_at > week_start_at;

      if job_limit is not null and existing_job_minutes + candidate_minutes > job_limit then
        raise exception 'This shift exceeds the job weekly limit.';
      end if;
    end if;

    week_start_date := week_start_date + 7;
  end loop;

  return new;
end;
$$;

-- Include saved break periods in the existing owner-scoped account export.
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

-- Publish the Terms and Privacy Policy that describe break-period settings.
-- BEGIN LEGAL SNAPSHOT
insert into public.legal_versions(version, minimum_age, documents) values ('2026-11-17.1', 16, $legal${"version":"2026-11-17.1","effectiveDate":"November 17, 2026","minimumAge":16,"operator":"Sandeep Pokharel, South Dakota, United States","contact":"contact@sandeeppokharel.com.np","terms":{"title":"Terms of Service","description":"The agreement, eligibility requirements, and rules for using the free ShiftSentry work hours tracker.","intro":"These Terms govern your use of ShiftSentry, operated by Sandeep Pokharel in South Dakota, United States. You must explicitly accept the current Terms before using the workspace. Our Privacy Policy explains how your information is handled.","sections":[{"title":"Who can use ShiftSentry","paragraphs":["You must be at least 16 years old. If you are under the age of majority where you live, you must have permission from a parent or guardian. This is the app's eligibility rule, not a statement of the age at which employment is lawful. We ask for your confirmation, not your birth date or identity documents."]},{"title":"Your account","paragraphs":["Provide accurate account information, protect your sign-in details, and contact us if you suspect unauthorized access. You are responsible for activity under your account, subject to rights that applicable law provides."]},{"title":"Work planning and earnings estimates","paragraphs":["ShiftSentry tracks the jobs and shifts you enter, enforces the hour limits you set, and estimates earnings using your entered rates, taxes, and deductions. It does not know the limits imposed by your employer, school, visa, or local law. A break cap you set applies to all jobs for a week when the first day of your local workweek falls within the break's inclusive dates. Individual job limits still apply. Its warnings and calculated totals are not legal, immigration, employment, tax, or financial advice, a payslip, or an official record of hours worked. Check the estimates against your employer's records and keep independent copies of important records."]},{"title":"Free service","paragraphs":["ShiftSentry currently has no paid accounts, subscriptions, or in-app purchases. We collect no payment details. There are no subscription renewals, cancellation charges, or refunds to administer. Any future paid offering would have its own disclosed price and payment terms before purchase."]},{"title":"Your content and intellectual property","paragraphs":["Your jobs, shifts, notes, and other content remain yours. You permit us to store and process them to provide and secure ShiftSentry as described in the Privacy Policy. This does not transfer ownership of your content. ShiftSentry's software and branding remain subject to their owners' rights; third-party software, fonts, and assets retain their respective licenses."]},{"title":"Acceptable use","items":["Do not access another person's account or data, bypass security or business limits, or disrupt or overload the service.","Do not harass or threaten other players, impersonate anyone, or put another person's private information into game names or clues.","Do not use the service for unlawful activity. Report suspected security problems to our contact address without testing against other people's accounts."]},{"title":"Google Calendar","paragraphs":["Calendar connection is optional and read-only. ShiftSentry cannot create, edit, or delete Google Calendar events. If you enable automatic shift sync for a job, matching event times become shifts in ShiftSentry; verify those shifts as you would manually entered ones. You may disconnect in Settings, and Google's own terms continue to apply to its services."]},{"title":"Game rooms and account deletion","paragraphs":["Your game name, clues, and votes are shared with participants in that room. Deleting your account removes your records and game contributions. Rooms you host, including their shared history, are deleted under the current room ownership model. The deletion screen explains this before you confirm."]},{"title":"Availability and account restrictions","paragraphs":["We work to keep the service available but cannot promise uninterrupted operation or error-free calculations. Features may change. We may restrict accounts that violate these Terms or put the service or others at risk. Contact us about a restriction or data request if you cannot sign in."]},{"title":"Exporting and closing your account","paragraphs":["Account tools let you download your data and request permanent account deletion. These tools remain available without accepting new Terms. Deletion requires recent authentication and an explicit confirmation, and cannot be undone through the app. If deletion fails or you cannot access your account, contact us for help. Export data before deletion if you need to keep it."]},{"title":"Disclaimer and limitation of liability","paragraphs":["ShiftSentry is provided as is and as available, without warranties to the extent allowed by law. To the extent allowed by law, the operator is not liable for indirect or consequential losses, including lost wages, fines, or visa and employment consequences from relying on the app's warnings or estimates. Nothing in these Terms excludes rights or liability that applicable law does not allow an agreement to exclude."]},{"title":"Changes and contact","paragraphs":["Material changes receive a new Terms version and require explicit acceptance before continued workspace use. Earlier accepted document versions remain available from the account's agreement history while the account exists. Questions, support, privacy requests, and security reports: contact@sandeeppokharel.com.np."]}]},"privacy":{"title":"Privacy Policy","description":"What ShiftSentry collects, its service providers, and how to export or delete your account data.","intro":"ShiftSentry is operated by Sandeep Pokharel in South Dakota, United States. This notice explains the information used to run the service and your account controls. Contact contact@sandeeppokharel.com.np for privacy questions or requests.","sections":[{"title":"Information we collect","items":["Account email and display name. Supabase handles authentication and stores password hashes for password accounts; we do not receive plaintext stored passwords. Google or GitHub sign-in may share basic profile information with the authentication provider.","Jobs, shifts, weekly notes, break-period dates, caps and optional labels, pay and tax rates, deductions, calculated earnings, calendar sync identifiers, and the schedule settings you provide.","Terms versions, server-recorded acceptance times, and confirmation that you meet our age and guardian-permission requirements. We do not store birth dates, identity documents, or acceptance IP addresses.","Game names, room membership and presence, clues, votes, and game state. Other room participants can see information needed for that game.","Limited administrative/security records and standard request information processed by our hosting and security providers, such as IP addresses and request timestamps."]},{"title":"Why we use it","paragraphs":["We use account and work information to provide the service you request, calculate estimates, save settings, and support you. We use limited security information to protect accounts, investigate abuse, and maintain the service. We do not sell personal information, share it for targeted advertising, or send promotional emails. Cloudflare Web Analytics remains enabled at the hosting layer to measure page visits and site performance. Its beacon reports page and referrer information and performance measurements to Cloudflare. It does not use analytics cookies or browser storage. Hosting and security providers also process operational request information. We do not install advertising trackers."]},{"title":"Optional Google Calendar access","items":["We request read-only calendar-list and event access. We cannot create, change, or delete events in Google Calendar.","Events are fetched when needed and displayed to you. We do not store event titles, descriptions, locations, or attendees.","If you enable automatic shift sync for a job, matching start/end times are stored as ShiftSentry shifts, along with calendar/event identifiers to follow changes. Turning sync off keeps the shifts. Disconnecting also removes the stored Google identifiers.","Access and refresh tokens are encrypted at rest and used only to access the calendars you connect. Disconnecting attempts to revoke access with Google and deletes our stored credentials. You can also revoke access from your Google Account's security settings.","Google user data is never sold, used for advertising, or used to train AI models. People do not read it except with your permission, for security reasons, or where required by law."],"paragraphs":["Our use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including its Limited Use requirements."],"link":{"href":"https://developers.google.com/terms/api-services-user-data-policy","label":"Google API Services User Data Policy"}},{"title":"Providers and access","paragraphs":["Supabase provides the database and authentication. The application is hosted on a server we operate and reached through Cloudflare, which also handles traffic delivery and security. Google and GitHub handle optional sign-in; Google also handles an optional calendar connection. These services receive the information needed for those functions and process some account, security, and operational information under their own policies.","Database access rules isolate personal work records by account. Administrators can access account details and work summaries for support and security. Game information is shared with room participants. We may disclose information if required by law. Provider processing may occur outside your state or country; contact us for information about the service's current hosting and provider settings."]},{"title":"Cookies and device storage","paragraphs":["Authentication and short-lived sign-in/security cookies support requested account functions. Your device stores theme and workspace preferences. The service worker caches static app assets and an offline page, not your account pages or work data. The Cookie and Storage Policy lists purposes, lifetimes, and removal instructions."]},{"title":"Retention","paragraphs":["Account and work records, including agreement history, remain while your account exists. Deleting your account removes them from the active application database. Minimal administrative/security audit entries follow a 30-day retention policy with daily cleanup. Deleted-user identifiers are removed from retained audit details. Evidence that must be kept for a specific legal obligation or investigation is held separately with restricted access and a documented retention reason.","Copies may remain in provider backups or provider-managed logs until those systems' configured retention periods expire. They are not ordinary active account records. If a backup is restored, completed deletions must be reapplied before the restored service is made available. Contact us for the current verified provider retention settings; we do not promise an unverified backup expiry period."]},{"title":"Your controls and requests","paragraphs":["You can edit your account settings and delete jobs, shifts, or break periods. Account tools provide a JSON download of your records and permanent account deletion, even if you decline updated Terms. Exports exclude passwords, tokens, other users' records, and hidden game roles or words. Deletion also removes rooms you host and their shared history, as explained before confirmation.","For access, correction, deletion, applicable portability, or other privacy rights, contact us from your account email. We verify requests using information proportionate to the request rather than routinely asking for identity documents. If you are unable to sign in, contact support. Rights and legally required response periods depend on the laws applicable to your request."]},{"title":"Eligibility and children","paragraphs":["ShiftSentry is for people aged 16 or older. Users below legal adulthood must have guardian permission. The service is not directed to children under 13, and we do not knowingly collect their information. Contact us if you believe an ineligible person's information was collected so we can investigate and remove it as appropriate."]},{"title":"Security and incidents","paragraphs":["We use authenticated access, database access controls, encrypted calendar tokens, HTTPS, and application security safeguards. No service can guarantee absolute security. We investigate suspected incidents and assess notification obligations under the laws applicable to affected individuals."]},{"title":"Changes and contact","paragraphs":["The effective date and version identify this notice. We announce material changes through the app and maintain the versions associated with recorded agreements. Terms acceptance acknowledges this notice; it is not blanket consent to optional marketing or tracking. Contact contact@sandeeppokharel.com.np."]}]},"cookies":{"title":"Cookie and Storage Policy","description":"Authentication cookies, local preferences, offline storage, their lifetimes, and how to clear them.","intro":"ShiftSentry uses device storage to deliver requested account and display functions. Cloudflare Web Analytics also measures page visits and performance without analytics cookies or browser storage. These purposes are separate from agreeing to our Terms.","sections":[{"title":"Authentication cookies","paragraphs":["Supabase cookies named sb-<project>-auth-token, including numbered chunks where needed, hold authentication tokens. The installed SSR SDK uses a cookie maximum age of 400 days, renewed as the session changes. Token validity and server-side session revocation are separate and may end access sooner. Sign-out clears the app's session cookies. An sb-<project>-auth-token-code-verifier cookie supports email/OAuth proof-key exchange and is cleared after a successful exchange; if an exchange is abandoned, SDK cookie expiry or clearing site data removes it."]},{"title":"Short-lived security and return cookies","items":["shiftsentry-next remembers the safe page to return to after signing in. It expires after 10 minutes and is cleared when the callback uses it.","shiftsentry-google-oauth protects an optional Google Calendar connection with state and proof-key information. It is HttpOnly, has a 10-minute lifetime, and is cleared by the calendar callback.","Cloudflare may use security cookies when a security challenge or abuse-prevention feature is used. Their presence and lifetime depend on the active Cloudflare configuration; these must be used for security, not visitor analytics."]},{"title":"Cloudflare Web Analytics","paragraphs":["Cloudflare injects a performance beacon at the hosting layer. It reports page visits, referring page information, and browser performance measurements. Cloudflare documents that its beacon does not store or access cookies, local storage, session storage, or IndexedDB. Its settings are managed independently from this app. Browser tools that block the beacon may prevent these measurements."],"link":{"href":"https://developers.cloudflare.com/speed/observatory/rum-beacon/","label":"Cloudflare beacon data and privacy documentation"}},{"title":"Local preferences","paragraphs":["The theme key and shiftsentry-prefixed keys remember selected theme, sidebar state, calendar view, earnings range, open shift weeks, game settings, and dismissed help. They are stored locally without a programmed expiry and remain until replaced or cleared. They do not hold your work records and are not used to identify you across websites."]},{"title":"Offline cache","paragraphs":["The service worker caches app assets and the offline page. It does not cache authenticated account pages or database responses. Old cache versions are removed when the service worker activates an update. Your browser can also evict storage."]},{"title":"Your choices","paragraphs":["Use the app's controls to choose preferences, sign out to clear authentication cookies, or clear this site's cookies and storage in your browser to remove preferences and caches. Blocking authentication or security cookies may prevent sign-in. No optional tracking choice is bundled into Terms acceptance. If optional tracking is introduced, we will update these disclosures and provide any required consent or opt-out controls before it operates."]}]}}$legal$::jsonb);
-- END LEGAL SNAPSHOT

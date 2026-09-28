-- Per-job Google Calendar linking and automatic shift sync.
--
-- A job can name the keyword (and optionally the one calendar) that marks its
-- shifts in Google Calendar, and opt in to having matching events become
-- shifts. A synced shift remembers the event it came from, so a later sync can
-- update or remove it instead of adding a second one, and a user who deletes
-- one can keep it deleted (the job's ignore list). The sync writes through the
-- ordinary RLS client, so every existing shift trigger -- the 24-hour limit,
-- weekly caps, overlaps, the pay snapshot -- applies to it unchanged.
--
-- Only the times of matching events are kept, as shifts; no event title or
-- description is stored anywhere. /privacy says so.

alter table public.jobs
  add column google_keyword text
    check (google_keyword is null or char_length(btrim(google_keyword)) between 1 and 80),
  add column google_calendar_id text
    check (google_calendar_id is null or char_length(google_calendar_id) between 1 and 255),
  add column google_sync boolean not null default false,
  add column google_sync_ignored text[] not null default '{}'
    check (cardinality(google_sync_ignored) <= 500);

comment on column public.jobs.google_keyword is 'Title keyword that marks this job''s events in Google Calendar; null means the job name.';
comment on column public.jobs.google_sync_ignored is 'calendarId:eventId keys of synced shifts the user deleted, so sync does not re-add them.';

alter table public.shifts
  add column google_calendar_id text check (google_calendar_id is null or char_length(google_calendar_id) <= 1024),
  add column google_event_id text check (google_event_id is null or char_length(google_event_id) <= 1024),
  add constraint shifts_google_link_complete
    check ((google_calendar_id is null) = (google_event_id is null));

-- One Google event feeds at most one of a user's shifts. Partial, so the
-- ordinary unlinked shifts are not indexed at all.
create unique index shifts_google_event_unique
  on public.shifts (user_id, google_calendar_id, google_event_id)
  where google_event_id is not null;

alter table public.google_calendar_connections
  add column shifts_synced_at timestamptz,
  add column sync_issues jsonb not null default '[]'::jsonb
    check (jsonb_typeof(sync_issues) = 'array' and jsonb_array_length(sync_issues) <= 20);

comment on column public.google_calendar_connections.sync_issues is 'Last sync''s refused shifts: job name, start, end, reason. Never an event title.';

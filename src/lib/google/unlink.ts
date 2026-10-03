/**
 * The one patch that stops a shift following its Google event. All three
 * columns move together: `shifts_google_adopted_linked` refuses an adopted
 * shift without a link, so clearing the ids but not `google_adopted` fails the
 * whole update on any shift sync adopted -- which is how turning a job's sync
 * off once broke. Kept import-free so every unlink path can share it.
 */
export const UNLINKED_SHIFT: { google_calendar_id: null; google_event_id: null; google_adopted: false } = { google_calendar_id: null, google_event_id: null, google_adopted: false };

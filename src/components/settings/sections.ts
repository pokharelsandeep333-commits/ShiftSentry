/**
 * The panes of the Settings window, in sidebar order, with the group each sits
 * in (a rule divides groups). The ids are the hashes other pages link to
 * (`/settings#google-calendar` from the calendar, `#week` from the dashboard's
 * first-run card, `#break-periods` from the week card), which open that pane,
 * so renaming one means finding its links too.
 *
 * A plain module rather than part of the nav component: the page is a server
 * component, and a value exported from a "use client" file reaches it only as a
 * client reference, not as the array.
 */
export const SETTINGS_SECTIONS = [
  { id: "week", label: "Profile and week", group: 0 },
  { id: "break-periods", label: "Break periods", group: 0 },
  { id: "google-calendar", label: "Google Calendar", group: 1 },
  { id: "appearance", label: "Appearance", group: 1 },
  { id: "account", label: "Account and privacy", group: 2 },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

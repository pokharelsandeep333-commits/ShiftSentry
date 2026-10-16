/**
 * The sections of /settings, in page order. The ids are anchors other pages
 * link to (`/settings#google-calendar` from the calendar, `#week` from the
 * dashboard's first-run card), so renaming one means finding its links too.
 *
 * A plain module rather than part of the nav component: the page is a server
 * component, and a value exported from a "use client" file reaches it only as a
 * client reference, not as the array.
 */
export const SETTINGS_SECTIONS = [
  { id: "week", label: "Profile and week" },
  { id: "google-calendar", label: "Google Calendar" },
  { id: "appearance", label: "Appearance" },
  { id: "account", label: "Account and privacy" },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

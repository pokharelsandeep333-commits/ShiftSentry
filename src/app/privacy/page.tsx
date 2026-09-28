import type { ReactNode } from "react";
import Link from "next/link";
import { Brand } from "@/components/brand";

/**
 * Public on purpose, like /login: Google's consent-screen Branding links here,
 * and its reviewers read it signed out. Static text, no session, no database.
 *
 * The Google Calendar section describes the optional calendar connection. Its
 * promises -- read-only scopes, events fetched live and never stored, tokens
 * encrypted, disconnect revokes -- are commitments the implementation must
 * keep; change this page in the same change that changes any of them.
 */
export const metadata = { title: "Privacy Policy | ShiftSentry" };

const CONTACT_EMAIL = "pokharelsandeep333@gmail.com";
const EFFECTIVE_DATE = "September 27, 2026";

export default function PrivacyPage() {
  return <main className="min-h-dvh bg-[var(--background)] px-4 py-10 sm:px-8 sm:py-14">
    <article className="mx-auto max-w-2xl">
      <Link href="/login" className="inline-block"><Brand /></Link>
      <h1 className="mt-10 font-display text-3xl font-semibold tracking-tight sm:text-4xl">Privacy Policy</h1>
      <p className="mt-3 text-sm text-[var(--muted-foreground)]">Effective {EFFECTIVE_DATE}</p>
      <p className="mt-6 leading-7">ShiftSentry helps you log work shifts, stay under weekly hour limits, and see what you have earned. This page explains what information ShiftSentry keeps, why, and what you can do about it.</p>

      <Section title="What we collect">
        <ul className="list-disc space-y-2 pl-5">
          <li><b>Account details.</b> Your email address and display name. If you sign in with Google or GitHub, our sign-in provider also receives the basic profile information that service shares, such as your name and profile picture address. If you sign up with an email and password, the password is stored only as a secure hash.</li>
          <li><b>Your work records.</b> The jobs, shifts, notes, pay rates, tax rates, and deductions you enter, and the earnings calculated from them.</li>
          <li><b>Your settings.</b> Your time zone, the day your week starts, and your weekly hour limits.</li>
          <li><b>Game rooms.</b> If you play the in-app game, your display name, clues, and votes are shown to the other players in that room.</li>
        </ul>
      </Section>

      <Section title="How we use it">
        <p>Only to run ShiftSentry for you: to sign you in, show your shifts and totals, warn you about hour limits, and keep the service secure. We do not sell your information, share it with advertisers, or use it for advertising. ShiftSentry has no analytics or advertising trackers.</p>
      </Section>

      <Section title="Google Calendar (optional)">
        <p>You can choose to connect a Google Calendar so ShiftSentry can show your upcoming events and warn you when a shift overlaps one. If you do:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>ShiftSentry asks only for <b>read-only</b> access: the list of your calendars and the events on the calendars you select. It cannot create, change, or delete anything in your Google account.</li>
          <li>Events are fetched from Google when a page needs them and shown only to you. ShiftSentry does not store your event details.</li>
          <li>If you turn on &ldquo;Add shifts from Google Calendar automatically&rdquo; for a job, the start and end times of that job&apos;s matching events are saved as shifts in your account, together with Google&apos;s identifiers for the event and calendar so each shift can follow changes. No event titles, descriptions, locations or attendees are saved. Turning sync off, or disconnecting Google Calendar, keeps those shifts as ordinary shifts; disconnecting also removes the stored Google identifiers.</li>
          <li>The access token Google issues is stored encrypted and is used only to fetch your events for you.</li>
          <li>You can disconnect at any time in Settings. Disconnecting revokes ShiftSentry&apos;s access with Google and deletes the stored token. You can also remove access from your Google Account&apos;s security settings.</li>
          <li>Google user data is never used for advertising, never sold, never used to train AI models, and never read by people except with your permission, for security reasons, or where the law requires it.</li>
        </ul>
        <p>ShiftSentry&apos;s use and transfer to any other app of information received from Google APIs will adhere to the <a className="font-semibold text-[var(--primary)] underline underline-offset-4" href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements.</p>
      </Section>

      <Section title="Where it is stored and who can see it">
        <p>Your data is stored in a managed PostgreSQL database run by Supabase, which also handles sign-in. The app runs on Amazon Web Services, and traffic passes through Cloudflare, which protects the site and sees standard request information such as IP addresses. These providers process data only to operate the service.</p>
        <p>Access rules in the database limit your records to your own account. ShiftSentry administrators can see account details and a summary of your jobs and recent shifts, and use this only for support and to keep the service safe.</p>
      </Section>

      <Section title="Cookies and browser storage">
        <p>ShiftSentry uses cookies to keep you signed in and to return you to the right page after signing in. Your browser also remembers display preferences, such as the light or dark theme, on your own device. The app caches its own static files so it can show an offline page; it never caches your pages or data.</p>
      </Section>

      <Section title="Keeping and deleting your data">
        <p>Your data is kept while your account exists. You can delete your shifts and jobs yourself at any time. To delete your account and everything in it, email <a className="font-semibold text-[var(--primary)] underline underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from the address you signed up with, and we will delete it. A record of administrative actions on your account, such as a password reset, may be kept for security.</p>
      </Section>

      <Section title="Children">
        <p>ShiftSentry is not directed to children under 13, and we do not knowingly collect their information.</p>
      </Section>

      <Section title="Changes and contact">
        <p>If this policy changes, the effective date above will change with it. Questions or requests: <a className="font-semibold text-[var(--primary)] underline underline-offset-4" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
      </Section>

      <p className="mt-12 text-sm"><Link href="/login" className="font-semibold text-[var(--primary)] transition-opacity hover:opacity-75">Back to ShiftSentry</Link></p>
    </article>
  </main>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section className="mt-10 space-y-4 leading-7">
    <h2 className="font-display text-xl font-semibold">{title}</h2>
    {children}
  </section>;
}

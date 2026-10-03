import Link from "next/link";
import { LEGAL_CONTACT_EMAIL as CONTACT_EMAIL, LegalPage, LegalSection as Section, legalLink } from "@/components/legal-page";

/**
 * Public on purpose, like /privacy: Google's consent-screen Branding links here
 * as the "Terms of Service" URL, and reviewers read it signed out.
 *
 * Every rule stated here describes something the app actually does — hour
 * limits are the ones the user sets, earnings come from the rates they enter,
 * accounts can be disabled, game rooms are shared. Change this page in the
 * same change that changes any of those.
 */
export const metadata = { title: "Terms of Service | ShiftSentry" };

const EFFECTIVE_DATE = "October 3, 2026";

export default function TermsPage() {
  return <LegalPage title="Terms of Service" effective={EFFECTIVE_DATE}>
    <p className="mt-6 leading-7">These terms are the agreement between you and ShiftSentry for using the ShiftSentry website and app. By creating an account or using ShiftSentry, you agree to them. If you do not agree, please do not use ShiftSentry. How we handle your information is explained in the <Link className={legalLink} href="/privacy">Privacy Policy</Link>.</p>

    <Section title="Who can use ShiftSentry">
      <p>You must be at least 13 years old to use ShiftSentry. If you are under the age of majority where you live, use it only with the permission of a parent or guardian.</p>
    </Section>

    <Section title="Your account">
      <p>You are responsible for keeping your sign-in details safe and for what happens under your account. Give accurate information when you sign up, and tell us at <a className={legalLink} href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> if you think someone else has used your account.</p>
    </Section>

    <Section title="What ShiftSentry is, and what it is not">
      <p>ShiftSentry is a planning tool. It tracks the shifts you enter, warns you as you approach the weekly hour limits you set, and estimates your earnings from the pay rates, tax rates, and deductions you enter.</p>
      <ul className="list-disc space-y-2 pl-5">
        <li><b>It does not know your legal limits.</b> ShiftSentry enforces only the limits you type in. It does not know what your visa, employer, school, or local law allows. Staying within those rules is your responsibility.</li>
        <li><b>Earnings are estimates.</b> Totals are calculated from the numbers you enter and are not a payslip, a tax filing, or an official record of hours worked. Check them against your employer&apos;s records.</li>
        <li><b>It is not advice.</b> Nothing in ShiftSentry is legal, immigration, tax, financial, or employment advice.</li>
      </ul>
    </Section>

    <Section title="Your content">
      <p>The jobs, shifts, notes, and other information you enter stay yours. You give ShiftSentry permission to store and process them only so that it can run the service for you, as described in the Privacy Policy.</p>
      <p>If you join a game room, your display name, clues, and votes are shown to the other players in that room. Do not use a display name or clue that is offensive, impersonates someone else, or shares anyone&apos;s personal information.</p>
    </Section>

    <Section title="Acceptable use">
      <p>Do not:</p>
      <ul className="list-disc space-y-2 pl-5">
        <li>try to access another person&apos;s account or data, or get around ShiftSentry&apos;s security or limits;</li>
        <li>disrupt or overload the service, or access it with bots or scrapers;</li>
        <li>harass, threaten, or abuse other people in game rooms;</li>
        <li>use ShiftSentry for anything illegal.</li>
      </ul>
      <p>If you find a security problem, please report it to <a className={legalLink} href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> instead of testing it against other people&apos;s accounts.</p>
    </Section>

    <Section title="Google Calendar">
      <p>Connecting a Google Calendar is optional. When you connect one, ShiftSentry reads your events as described in the Privacy Policy, and your use of Google&apos;s services remains subject to Google&apos;s own terms. If you turn on automatic shift sync for a job, ShiftSentry creates and updates shifts from matching events; check them as you would any shift you entered yourself. You can disconnect at any time in Settings.</p>
    </Section>

    <Section title="Availability and changes to the service">
      <p>We work to keep ShiftSentry running and your data safe, but we cannot promise the service will always be available or free of errors. We may change, add, or remove features. Keep your own copy of any records you need for pay, tax, or immigration purposes.</p>
    </Section>

    <Section title="Suspending or closing accounts">
      <p>We may suspend or disable an account that breaks these terms or puts the service or other people at risk. A disabled account cannot sign in or use game rooms. You can stop using ShiftSentry at any time, and you can ask us to delete your account by emailing <a className={legalLink} href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from the address you signed up with.</p>
    </Section>

    <Section title="Disclaimer and limitation of liability">
      <p>ShiftSentry is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of any kind, to the extent the law allows. To the extent the law allows, ShiftSentry and the people who run it are not liable for indirect or consequential losses arising from your use of the service, including lost wages, fines, penalties, or visa or employment consequences from relying on its limits, warnings, or estimates. Nothing in these terms limits rights you have under laws that cannot be excluded by agreement.</p>
    </Section>

    <Section title="Changes to these terms">
      <p>If these terms change, the effective date above will change with them. Continuing to use ShiftSentry after a change means you accept the new terms.</p>
    </Section>

    <Section title="Contact">
      <p>Questions about these terms: <a className={legalLink} href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
    </Section>
  </LegalPage>;
}

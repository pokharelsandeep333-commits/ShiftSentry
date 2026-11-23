import { ChevronDown, Mail } from "lucide-react";
import { LEGAL_CONTACT_EMAIL } from "@/components/legal-page";

export type FaqItem = { question: string; answer: string };

/**
 * The landing's questions, shown in `WelcomeFaq` and repeated as `FAQPage`
 * data by `WelcomeJsonLd`, so the markup can never describe text the page
 * does not show. Like the rest of the landing, every answer states a rule the
 * app or the database enforces, or a promise the legal pages make: the limits
 * and warnings (`limit-check.ts` and its trigger), the midnight split and 24
 * hour cap, the pay snapshot, the free service and the calendar scopes
 * (`/terms`, `/privacy`). Change an answer in the same change as its rule.
 *
 * The calendar answer is left out while the integration is switched off, as
 * the landing's calendar sentence is.
 */
export function faqItems(calendarEnabled: boolean): FaqItem[] {
  return [
    { question: "Is ShiftSentry free?", answer: "Yes. There are no paid accounts, subscriptions or in-app purchases, and it never asks for payment details." },
    { question: "How does the weekly hour limit work?", answer: "Set a default weekly limit across all your jobs. If the first day of your workweek falls within a break period you set, that period's cap applies for the whole week. Separate caps for individual jobs still apply. Logged and planned shifts count, and ShiftSentry refuses shifts that would put you over a cap." },
    { question: "Does it know my visa, school or employer hour limit?", answer: "No. You enter the limit yourself, so set it to whatever applies to you. Its warnings and totals are not legal, immigration, employment or tax advice." },
    { question: "How are overnight shifts counted?", answer: "Midnight splits the shift: each part counts toward the day it falls on, in your own time zone. A shift can run up to 24 hours, two shifts can't overlap, and your week can start on any day." },
    { question: "How are my earnings estimated?", answer: "From the hourly rate, tax and deductions you enter for each job. Each shift keeps the rate and tax it was worked at, so a raise next month doesn't change last month's totals. It's an estimate, not a payslip." },
    { question: "Who can see my jobs and shifts?", answer: "Other ShiftSentry users can't. Database rules keep each account's work records separate. The administrator can see account details and work summaries for support and security." },
    ...(calendarEnabled ? [{ question: "What can ShiftSentry do with my Google Calendar?", answer: "Connecting is optional and read-only. ShiftSentry can't create, change or delete events, and it doesn't store event titles, descriptions, locations or attendees. Disconnecting asks Google to revoke access and deletes the stored tokens." }] : []),
    { question: "Can I export or delete my data?", answer: "Yes. Your account page downloads all your records as a JSON file and deletes your account permanently. Both work even if you haven't accepted updated Terms." },
    { question: "Does it work on my phone?", answer: "Yes. It installs to your home screen like an app, and you can sign in with Google, GitHub or email. It needs a connection to load and save shifts." },
  ];
}

/**
 * The questions as native disclosure widgets: keyboard and screen-reader
 * behaviour come from `<details>`, and every answer is in the server HTML,
 * open or not, for crawlers and for find-in-page. On wide screens the heading
 * and the contact line sit in a sticky left column beside the list. Opening
 * one eases its answer open where the browser can animate to `auto`
 * (`.faq-item` in globals.css); elsewhere it simply appears.
 */
export function WelcomeFaq({ items, className, titleClassName }: { items: FaqItem[]; className: string; titleClassName: string }) {
  return <section id="faq" aria-labelledby="faq-title" className={className}>
    <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
      <div className="lg:col-span-4">
        <div className="lg:sticky lg:top-28">
          <h2 id="faq-title" className={titleClassName}>Questions, answered.</h2>
          <p className="mt-4 max-w-sm text-[15px] leading-7 text-[var(--muted-foreground)]">Can&apos;t find yours? Send it straight to the person who builds ShiftSentry.</p>
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} title={LEGAL_CONTACT_EMAIL} className="welcome-ghost mt-5 inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-[background-color,border-color,translate] duration-200 ease-out hover:-translate-y-0.5">
            <Mail className="size-4 text-[var(--primary)]" strokeWidth={2} />Email a question
          </a>
        </div>
      </div>
      <div className="divide-y border-y lg:col-span-8">
        {items.map(({ question, answer }) => <details key={question} className="faq-item group">
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 py-5 font-display text-base font-semibold leading-snug transition-colors hover:text-[var(--primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] sm:text-[1.0625rem] [&::-webkit-details-marker]:hidden">
            {question}
            <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full border text-[var(--muted-foreground)] transition-[rotate,background-color,border-color,color] duration-300 ease-out group-open:rotate-180 group-open:border-transparent group-open:bg-[var(--primary)] group-open:text-[var(--primary-foreground)]">
              <ChevronDown className="size-4" strokeWidth={2.25} />
            </span>
          </summary>
          <p className="max-w-[62ch] pb-6 pr-14 text-[15px] leading-7 text-[var(--muted-foreground)]">{answer}</p>
        </details>)}
      </div>
    </div>
  </section>;
}

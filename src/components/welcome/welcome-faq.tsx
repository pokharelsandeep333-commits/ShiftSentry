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
    { question: "How does the weekly hour limit work?", answer: "You set one weekly limit that covers every job, and you can add a separate cap for any single job. Logged and planned shifts both count. You're warned at 80% and 90%, and a shift that would take you past either limit is refused." },
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
 * open or not, for crawlers and for find-in-page.
 */
export function WelcomeFaq({ items, className, titleClassName }: { items: FaqItem[]; className: string; titleClassName: string }) {
  return <section id="faq" aria-labelledby="faq-title" className={className}>
    <h2 id="faq-title" className={titleClassName}>Questions, answered.</h2>
    <div className="mt-6 divide-y border-y sm:mt-8">
      {items.map(({ question, answer }) => <details key={question} className="group">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 font-display text-base font-semibold leading-snug focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] [&::-webkit-details-marker]:hidden">
          {question}
          <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--primary-soft)] text-lg leading-none text-[var(--primary)] transition-[rotate] duration-200 group-open:rotate-45">+</span>
        </summary>
        <p className="max-w-[62ch] pb-5 text-[15px] leading-7 text-[var(--muted-foreground)]">{answer}</p>
      </details>)}
    </div>
  </section>;
}

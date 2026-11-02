import { LEGAL_CONTACT_EMAIL } from "@/components/legal-page";
import type { FaqItem } from "@/components/welcome/welcome-faq";

const origin = "https://sentry.sandeeppokharel.com.np";

/**
 * Schema.org data for the landing: the app, who publishes it, the site and the
 * FAQ, as one `@graph` so they reference each other by `@id`. The FAQ entries
 * are the ones `WelcomeFaq` renders, passed in, never a second copy.
 *
 * Like the landing's copy, it states only what is true: the app is free (the
 * terms say so), the maker is the operator the legal pages name, and there is
 * no rating or review, because Google treats invented ones as spam.
 *
 * It renders inside `WelcomeLanding`'s root element, not beside it in
 * `welcome/page.tsx`: the page's `<ViewTransition>` must sit above every DOM
 * node of the page (`src/app/CLAUDE.md`). A `ld+json` block is data, not
 * script, so the CSP does not apply and it needs no nonce. The `<` escape is
 * Next's recommended guard for JSON inside a `<script>` element.
 */
const SITE = [
  {
    "@type": "WebApplication",
    "@id": `${origin}/#app`,
    name: "ShiftSentry",
    url: `${origin}/`,
    description: "A work hours tracker for students and anyone with more than one job: log shifts, get warned before you pass your weekly hour limit, and estimate what you earned after tax.",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Any (web, installable PWA)",
    browserRequirements: "Requires JavaScript",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    publisher: { "@id": `${origin}/#org` },
  },
  {
    "@type": "Organization",
    "@id": `${origin}/#org`,
    name: "ShiftSentry",
    url: `${origin}/`,
    logo: `${origin}/icon-512.png`,
    email: LEGAL_CONTACT_EMAIL,
    founder: { "@type": "Person", name: "Sandeep Pokharel", url: `${origin}/about` },
  },
  {
    "@type": "WebSite",
    "@id": `${origin}/#website`,
    name: "ShiftSentry",
    url: `${origin}/`,
    publisher: { "@id": `${origin}/#org` },
  },
];

export function WelcomeJsonLd({ faq }: { faq: FaqItem[] }) {
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      ...SITE,
      {
        "@type": "FAQPage",
        "@id": `${origin}/#faq`,
        url: `${origin}/`,
        mainEntity: faq.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })),
      },
    ],
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, "\\u003c") }} />;
}

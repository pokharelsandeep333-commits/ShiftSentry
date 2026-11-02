import Link from "next/link";
import { ArticlePage, ArticleSection } from "@/components/article-page";
import { LEGAL_CONTACT_EMAIL, legalLink } from "@/components/legal-page";
import { publicMetadata } from "@/lib/public-metadata";

export const metadata = publicMetadata("About ShiftSentry | Who makes it and how it runs", "ShiftSentry is a free work hours tracker built and run by Sandeep Pokharel in South Dakota. What it's for, who makes it, and how your data is handled.", "/about");

const origin = "https://sentry.sandeeppokharel.com.np";

/**
 * Who is behind the app. Names only the operator the legal pages already
 * name, and its "how it runs" section repeats the Privacy Policy's provider
 * list, so the two change together. The person here is the `founder` in the
 * landing's Organization data and the author of the guides.
 */
const PERSON = {
  "@context": "https://schema.org",
  "@type": "AboutPage",
  url: `${origin}/about`,
  mainEntity: { "@type": "Person", name: "Sandeep Pokharel", url: `${origin}/about`, email: LEGAL_CONTACT_EMAIL, address: { "@type": "PostalAddress", addressRegion: "SD", addressCountry: "US" } },
  about: { "@id": `${origin}/#app` },
};

export default function Page() {
  return <ArticlePage title="About ShiftSentry" lede="ShiftSentry is a free work hours tracker for students and anyone with more than one job. It is built and run by Sandeep Pokharel, in South Dakota.">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(PERSON).replace(/</g, "\\u003c") }} />
    <ArticleSection heading="What it's for">
      <p>Each employer sees only its own hours, but a weekly limit usually applies to all of them together. ShiftSentry keeps that total: you add your jobs and a weekly limit, log the shifts you&apos;ve worked and the ones you&apos;ve planned, and it warns you at 80% and 90% and refuses a shift that would take you over.</p>
      <p>It also estimates what each shift pays after tax and deductions, from the rates you enter. The <Link href="/#faq" className={legalLink}>questions on the home page</Link> cover the rules in more detail.</p>
    </ArticleSection>
    <ArticleSection heading="Who makes it">
      <p>ShiftSentry is an independent project by Sandeep Pokharel. It has no paid plans and no ads. The source code is public on <a href="https://github.com/pokharelsandeep333-commits/ShiftSentry" className={legalLink}>GitHub</a>.</p>
    </ArticleSection>
    <ArticleSection heading="How it runs">
      <p>Supabase provides the database and sign-in. The app itself runs on a server Sandeep operates, reached through Cloudflare, which also handles traffic delivery and security. Database rules keep each account&apos;s work records separate, and personal data is never sold or used for advertising. The <Link href="/privacy" className={legalLink}>Privacy Policy</Link> has the details, and your account page exports or deletes your data at any time.</p>
    </ArticleSection>
    <ArticleSection heading="Contact">
      <p>Questions, bug reports, privacy requests and security reports all go to <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className={legalLink}>{LEGAL_CONTACT_EMAIL}</a>.</p>
    </ArticleSection>
  </ArticlePage>;
}

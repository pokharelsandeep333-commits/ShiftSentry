import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ArticlePage } from "@/components/article-page";
import { GUIDES } from "@/lib/guides";
import { publicMetadata } from "@/lib/public-metadata";

const origin = "https://sentry.sandeeppokharel.com.np";

export const metadata = publicMetadata("Guides | ShiftSentry", "Short guides to tracking hours across several jobs, staying under a weekly hour limit, and estimating your take-home pay for each shift.", "/guides");

/**
 * The guides index, linked from the landing's nav. It lists `GUIDES` (the
 * text and the rule it follows live in `src/lib/guides.ts`), so a new guide
 * appears here, in the sitemap and in `/llms.txt` with no other change.
 */
export default function GuidesPage() {
  const data = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "ShiftSentry guides",
    url: `${origin}/guides`,
    hasPart: GUIDES.map((guide) => ({ "@type": "Article", headline: guide.heading, url: `${origin}/guides/${guide.slug}` })),
  };
  return <ArticlePage title="Guides" lede="Short answers to the questions people ask before they start counting hours across more than one job.">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />
    <ul className="mt-10 grid gap-3">
      {GUIDES.map((guide) => <li key={guide.slug}>
        <Link href={`/guides/${guide.slug}`} className="group block rounded-2xl border bg-[var(--card)] p-5 transition-[border-color,translate] duration-200 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--primary)_40%,var(--border))] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--primary)] sm:p-6">
          <span className="flex items-start justify-between gap-4">
            <span className="font-display text-lg font-semibold leading-snug">{guide.heading}</span>
            <ArrowRight aria-hidden="true" className="mt-1 size-4 shrink-0 text-[var(--primary)] transition-transform duration-200 group-hover:translate-x-0.5" />
          </span>
          <span className="mt-2 block leading-7 text-[var(--muted-foreground)]">{guide.description}</span>
        </Link>
      </li>)}
    </ul>
  </ArticlePage>;
}

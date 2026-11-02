import { notFound } from "next/navigation";
import { ArticlePage, ArticleSection } from "@/components/article-page";
import { GUIDES, guideBySlug } from "@/lib/guides";
import { publicMetadata } from "@/lib/public-metadata";

const origin = "https://sentry.sandeeppokharel.com.np";

/** The guides' text lives in `src/lib/guides.ts`, with the rule it must follow. */
export function generateStaticParams() {
  return GUIDES.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const guide = guideBySlug((await params).slug);
  return guide ? publicMetadata(`${guide.title} | ShiftSentry`, guide.description, `/guides/${guide.slug}`) : {};
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const guide = guideBySlug((await params).slug);
  if (!guide) notFound();
  const url = `${origin}/guides/${guide.slug}`;
  /* An Article by the operator the legal pages name, plus its breadcrumb. */
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: guide.heading,
        description: guide.description,
        url,
        mainEntityOfPage: url,
        datePublished: guide.published,
        dateModified: guide.updated,
        author: { "@type": "Person", name: "Sandeep Pokharel", url: `${origin}/about` },
        publisher: { "@id": `${origin}/#org` },
        image: `${origin}/opengraph-image`,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "ShiftSentry", item: `${origin}/` },
          { "@type": "ListItem", position: 2, name: guide.heading, item: url },
        ],
      },
    ],
  };
  return <ArticlePage title={guide.heading} lede={guide.lede}>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />
    {guide.sections.map((section) => <ArticleSection key={section.heading} heading={section.heading}>
      {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
    </ArticleSection>)}
  </ArticlePage>;
}

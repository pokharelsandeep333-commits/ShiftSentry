import Link from "next/link";
import { LegalPage, LegalSection, legalLink } from "./legal-page";
import type { LegalDocuments } from "@/lib/legal-documents";

export function LegalDocumentContent({ documents, kind }: { documents: LegalDocuments; kind: "terms" | "privacy" | "cookies" }) {
  const document = documents[kind];
  return <LegalPage title={document.title} effective={documents.effectiveDate}>
    <p className="mt-3 text-xs text-[var(--muted-foreground)]">Version {documents.version}</p>
    <p className="mt-6 leading-7">{document.intro}</p>
    {document.sections.map((section) => <LegalSection title={section.title} key={section.title}>
      {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      {section.items && <ul className="list-disc space-y-2 pl-5">{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}
      {section.link && <p><a href={section.link.href} className={legalLink} rel="noopener noreferrer">{section.link.label}</a></p>}
    </LegalSection>)}
    <p className="mt-8 flex flex-wrap gap-3"><a className={legalLink} href={`mailto:${documents.contact}`}>Contact the operator</a><Link className={legalLink} href="/account">Account tools</Link></p>
  </LegalPage>;
}

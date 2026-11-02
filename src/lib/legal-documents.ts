import v20261011 from "./legal/versions/2026-10-11.1.json";
import current from "./legal/versions/2026-11-02.1.json";
import { LEGAL_VERSION } from "./legal";

export type LegalDocument = { title: string; description: string; intro: string; sections: { title: string; paragraphs?: string[]; items?: string[]; link?: { href: string; label: string } }[] };
export type LegalDocuments = { version: string; effectiveDate: string; minimumAge: number; operator: string; contact: string; terms: LegalDocument; privacy: LegalDocument; cookies: LegalDocument };
export const CURRENT_LEGAL_DOCUMENTS: LegalDocuments = current;
/** Every published version, kept so `/account` can link each one a user accepted. */
const VERSIONS: LegalDocuments[] = [v20261011, current];

export function legalDocuments(version = LEGAL_VERSION): LegalDocuments | null {
  return VERSIONS.find((documents) => documents.version === version) ?? null;
}

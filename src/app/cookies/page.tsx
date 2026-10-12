import { notFound } from "next/navigation";
import { LegalDocumentContent } from "@/components/legal-document";
import { CURRENT_LEGAL_DOCUMENTS, legalDocuments } from "@/lib/legal-documents";
import { publicMetadata } from "@/lib/public-metadata";

export const metadata = publicMetadata("Cookie and Storage Policy | ShiftSentry", CURRENT_LEGAL_DOCUMENTS.cookies.description, "/cookies");

export default async function Page({ searchParams }: { searchParams: Promise<{ version?: string }> }) {
  const documents = legalDocuments((await searchParams).version);
  if (!documents) notFound();
  return <LegalDocumentContent documents={documents} kind="cookies" />;
}

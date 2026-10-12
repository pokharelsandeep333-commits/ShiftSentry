import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { Brand } from "@/components/brand";
import { LicenseBrowser } from "@/components/licenses/license-browser";
import { buttonVariants } from "@/components/ui/button";
import { legalLink } from "@/components/legal-page";
import { publicMetadata } from "@/lib/public-metadata";
import type { LicenseCatalog } from "@/lib/license-types";

export const metadata = publicMetadata("Open-source licenses | ShiftSentry", "Explore the open-source libraries behind ShiftSentry and read or download their license notices.", "/open-source-licenses");

export default async function Page() {
  // Generated before dev/build from the installed platform; public is also
  // copied into the standalone image. Full texts are loaded only on expansion.
  const catalog: LicenseCatalog = JSON.parse(await readFile(join(process.cwd(), "public/license-catalog.json"), "utf8"));
  return <main className="min-h-dvh px-4 py-8 sm:px-8 sm:py-12">
    <div className="mx-auto max-w-4xl">
      <nav aria-label="Page navigation" className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className="inline-flex min-h-11 items-center rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--primary)]"><Brand /></Link>
        <Link href="/" className={buttonVariants({ variant: "ghost", size: "sm" })}><ArrowLeft className="size-4" aria-hidden="true" />Back to home</Link>
      </nav>
      <header className="mb-10 mt-12 sm:mt-16">
        <h1 className="text-balance font-display text-4xl font-semibold tracking-tight sm:text-5xl">Built with open source.</h1>
        <p className="mt-5 max-w-[65ch] text-base leading-7 text-[var(--muted-foreground)]">ShiftSentry is made possible by libraries created and maintained by the open-source community. Explore their licenses and acknowledgments here.</p>
        <p className="mt-3 max-w-[65ch] text-sm leading-6 text-[var(--muted-foreground)]">These notices credit the software we use. They are separate from your Terms of Service and do not require acceptance.</p>
        <a href="/third-party-notices.txt" download className={`${buttonVariants({ variant: "outline" })} mt-6`}><Download className="size-4" aria-hidden="true" />Download complete notices</a>
      </header>
      <LicenseBrowser catalog={catalog} />
      <footer className="mt-12 border-t border-[var(--border)] pt-6">
        <p className="max-w-[65ch] text-sm leading-6 text-[var(--muted-foreground)]">Each library retains its own license. This page lists unique installed production packages in this build, including the libraries they depend on. The complete download preserves bundled notices and license texts.</p>
        <nav aria-label="Legal links" className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <Link href="/privacy" className={`${legalLink} inline-flex min-h-11 items-center`}>Privacy Policy</Link>
          <Link href="/terms" className={`${legalLink} inline-flex min-h-11 items-center`}>Terms of Service</Link>
          <Link href="/cookies" className={`${legalLink} inline-flex min-h-11 items-center`}>Cookies and storage</Link>
        </nav>
      </footer>
    </div>
  </main>;
}

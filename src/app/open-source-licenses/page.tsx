import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Download } from "lucide-react";
import { LicenseBrowser } from "@/components/licenses/license-browser";
import { PublicPage } from "@/components/public-page";
import { buttonVariants } from "@/components/ui/button";
import { publicMetadata } from "@/lib/public-metadata";
import type { LicenseCatalog } from "@/lib/license-types";

export const metadata = publicMetadata("Open-source licenses | ShiftSentry", "Explore the open-source libraries behind ShiftSentry and read or download their license notices.", "/open-source-licenses");

export default async function Page() {
  // Generated before dev/build from the installed platform; public is also
  // copied into the standalone image. Full texts are loaded only on expansion.
  const catalog: LicenseCatalog = JSON.parse(await readFile(join(process.cwd(), "public/license-catalog.json"), "utf8"));
  // The landing's nav and footer frame it (`PublicPage`); the column stays
  // wider than the reading pages' for the license browser, and the prose in it
  // keeps its own 65ch measure.
  return <PublicPage>
    <div className="mx-auto max-w-4xl [text-wrap:pretty]">
      <header className="mb-10">
        <h1 className="text-balance font-display text-4xl font-semibold tracking-tight sm:text-5xl">Built with open source.</h1>
        <p className="mt-5 max-w-[65ch] text-base leading-7 text-[var(--muted-foreground)]">ShiftSentry is made possible by libraries created and maintained by the open-source community. Explore their licenses and acknowledgments here.</p>
        <p className="mt-3 max-w-[65ch] text-sm leading-6 text-[var(--muted-foreground)]">These notices credit the software we use. They are separate from your Terms of Service and do not require acceptance.</p>
        <a href="/third-party-notices.txt" download className={`${buttonVariants({ variant: "outline" })} mt-6`}><Download className="size-4" aria-hidden="true" />Download complete notices</a>
      </header>
      <LicenseBrowser catalog={catalog} />
      <div className="mt-12 border-t border-[var(--border)] pt-6">
        <p className="max-w-[65ch] text-sm leading-6 text-[var(--muted-foreground)]">Each library retains its own license. This page lists unique installed production packages in this build, including the libraries they depend on. The complete download preserves bundled notices and license texts.</p>
      </div>
    </div>
  </PublicPage>;
}

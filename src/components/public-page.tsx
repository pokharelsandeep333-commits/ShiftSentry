import type { ReactNode } from "react";
import { WelcomeFooter } from "@/components/welcome/welcome-footer";
import { WelcomeNav } from "@/components/welcome/welcome-nav";
import { cn } from "@/lib/utils";

/**
 * The landing's frame for the public pages that are not the landing: /about,
 * /guides and each guide (`ArticlePage`), the legal pages (`LegalPage`) and
 * /open-source-licenses. It puts them on the landing's ground
 * (`.welcome-page`, which also defines the `--w-*` surfaces the nav and footer
 * are drawn with) under the same top bar and over the same footer, so none of
 * them is a dead end with only a logo at the top.
 *
 * A server component: only `WelcomeNav` (its scroll observer and theme switch)
 * and the footer's `SignInLink`s hydrate. Neither these pages nor the shell
 * carry the permanent `sign-in-box` name, so a clicked `SignInLink` is the
 * only element with it, as on the landing.
 *
 * `base="/"` points the nav's and footer's section links at the landing
 * (`/#how`); on the landing itself they are bare fragments.
 */
const panel = "welcome-panel welcome-container mx-auto rounded-[1.5rem]";

export function PublicPage({ children, className }: { children: ReactNode; className?: string }) {
  return <div className="welcome-page relative flex min-h-dvh flex-col overflow-x-clip">
    <WelcomeNav base="/" />
    {/* The nav is fixed, so the top padding is what clears it. */}
    <main className={cn("flex-1 px-4 pb-16 pt-28 sm:px-8 sm:pb-20 sm:pt-32", className)}>{children}</main>
    <WelcomeFooter className={panel} base="/" />
  </div>;
}

/**
 * The reading column. At 34rem the 16px body text runs a median of 69
 * characters a line (most lines 64 to 74, measured on /privacy), inside the
 * range that reads comfortably; at the old 42rem it was 88. Sized in rem, not
 * ch: Inter's "0" is wide, so 68ch came out at 686px and still about 88. The
 * `text-wrap` property inherits, so `pretty` here reaches every paragraph and
 * list item and keeps a lone word off a paragraph's last line. Headings set
 * their own `balance`.
 */
export const readingColumn = "mx-auto max-w-[34rem] [text-wrap:pretty]";

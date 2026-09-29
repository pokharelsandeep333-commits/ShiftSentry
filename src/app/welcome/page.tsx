import { ViewTransition } from "react";
import { WelcomeLanding } from "@/components/welcome/welcome-landing";

/**
 * The public home page. `src/proxy.ts` rewrites a signed-out visit to `/` here;
 * signed-in visitors get their dashboard at the same URL. The page itself lives
 * in `WelcomeLanding`.
 *
 * The boundary is the front page's half of the move to /login: on a
 * `to-login` navigation (the `SignInLink`s) the page fades out while the
 * clicked button opens into the sign-in box. Nothing else about it animates:
 * coming back, the page is simply there underneath the sign-in page as that
 * fades away, and plays its own intro.
 */
export const metadata = {
  title: "ShiftSentry | Plan shifts under your weekly hour limit",
  description: "ShiftSentry tracks shifts across your jobs, warns you before you pass your weekly hour limit, and shows what you earned after tax.",
};

export default function WelcomePage() {
  return <ViewTransition exit={{ "to-login": "page-leave", default: "none" }} default="none">
    <WelcomeLanding />
  </ViewTransition>;
}

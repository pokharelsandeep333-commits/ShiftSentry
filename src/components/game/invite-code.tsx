"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Link2, QrCode } from "lucide-react";
import { encode } from "uqr";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { gameInvitePath } from "@/lib/game";
import { cn } from "@/lib/utils";

/**
 * The invite code, sized to be read off a screen across a table, plus the three
 * ways people actually share it: read it out, send the link, or hold up a QR
 * code for everyone to scan.
 *
 * The QR is drawn as plain `<rect>` elements from the module matrix rather than
 * as an SVG string set via innerHTML -- no markup is ever handed to the DOM
 * unparsed. The origin comes from `window.location`, the same place the copy
 * button gets it, so the two cannot encode different links.
 *
 * Both copy buttons fall back to selecting nothing and just telling the user the
 * code: `navigator.clipboard` is unavailable on an insecure origin and can be
 * refused by permission policy, and a copy button that silently does nothing is
 * worse than one that admits it.
 */
export function InviteCode({ code }: { code: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [showQr, setShowQr] = useState(false);

  // Read at render rather than in an effect so the first paint after the toggle
  // already has the link -- this is a client component, and by the time the
  // button can be pressed `window` exists. The path helper is shared with the
  // server so a QR scan and a typed link land on the same page.
  const invite = () => `${window.location.origin}${gameInvitePath(code)}`;

  async function copy(kind: "code" | "link") {
    const value = kind === "code" ? code : invite();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      toast(kind === "code" ? "Code copied" : "Invite link copied");
      window.setTimeout(() => setCopied((current) => (current === kind ? null : current)), 2_000);
    } catch {
      toast(`Copy failed. The code is ${code}`);
    }
  }

  return <div className="rounded-2xl border border-[color-mix(in_srgb,var(--primary)_28%,var(--border))] bg-[var(--primary-soft)] p-5 text-center">
    <p className="text-sm font-semibold text-[var(--primary)]">Invite code</p>
    <p className="mt-2 font-display text-4xl font-semibold tracking-[0.28em] sm:text-5xl" aria-label={`Invite code ${code.split("").join(" ")}`}>{code}</p>

    {showQr && <InviteQr href={invite()} />}

    <div className="mt-4 flex flex-wrap justify-center gap-2">
      <Button
        type="button"
        variant={showQr ? "default" : "outline"}
        size="sm"
        aria-pressed={showQr}
        onClick={() => setShowQr((open) => !open)}
      >
        <QrCode className="size-3.5" />
        {showQr ? "Hide QR" : "Show QR"}
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => copy("code")}>
        {copied === "code" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        Copy code
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => copy("link")}>
        {copied === "link" ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />}
        Copy link
      </Button>
    </div>
  </div>;
}

/**
 * Black-on-white always, whatever the theme. Scanners are tuned for dark
 * modules on a light ground, and a phone camera pointed at an inverted QR on a
 * dark screen across a table is exactly the kind of thing that "mostly works".
 * Medium error correction so a thumb over a corner still reads.
 */
function InviteQr({ href }: { href: string }) {
  const qr = useMemo(() => encode(href, { ecc: "M", border: 2 }), [href]);

  return <div className="mt-4 grid justify-items-center gap-2">
    <svg
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      role="img"
      aria-label={`QR code for the invite link ${href}`}
      shapeRendering="crispEdges"
      className={cn("size-48 max-w-full rounded-xl bg-white sm:size-56")}
    >
      <rect width={qr.size} height={qr.size} fill="#fff" />
      {qr.data.map((row, y) => row.map((dark, x) => dark && <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="#000" />))}
    </svg>
    <p className="text-xs leading-5 text-[var(--muted-foreground)]">Point a phone camera at it to join.</p>
  </div>;
}

"use client";

import { useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";

/**
 * The invite code, sized to be read off a screen across a table, plus the two
 * ways people actually share it.
 *
 * Both copy buttons fall back to selecting nothing and just telling the user the
 * code: `navigator.clipboard` is unavailable on an insecure origin and can be
 * refused by permission policy, and a copy button that silently does nothing is
 * worse than one that admits it.
 */
export function InviteCode({ code }: { code: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  async function copy(kind: "code" | "link") {
    const value = kind === "code" ? code : `${window.location.origin}/game/${code}`;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      toast(kind === "code" ? "Code copied" : "Invite link copied");
      window.setTimeout(() => setCopied((current) => (current === kind ? null : current)), 2_000);
    } catch {
      toast(`Copy failed — the code is ${code}`);
    }
  }

  return <div className="rounded-2xl border border-[color-mix(in_srgb,var(--primary)_28%,var(--border))] bg-[var(--primary-soft)] p-5 text-center">
    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Invite code</p>
    <p className="mt-2 font-display text-4xl font-semibold tracking-[0.28em] sm:text-5xl" aria-label={`Invite code ${code.split("").join(" ")}`}>{code}</p>
    <div className="mt-4 flex flex-wrap justify-center gap-2">
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

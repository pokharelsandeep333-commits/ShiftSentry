import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/brand";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AccountDisabledPage() {
  return <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,color-mix(in_srgb,var(--primary)_14%,transparent),transparent_32rem),var(--background)] p-4"><Card className="w-full max-w-md border-[color-mix(in_srgb,var(--danger)_22%,var(--border))]"><CardHeader><Brand className="mb-5" /><span className="mb-2 grid size-12 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]"><LockKeyhole className="size-6 text-[var(--danger)]" /></span><CardTitle className="text-xl">Your account is disabled</CardTitle><CardDescription className="mt-1.5 leading-6">Please contact ShiftSentry support if you think this is a mistake.</CardDescription></CardHeader><CardContent><Link href="/login"><Button>Return to sign in</Button></Link></CardContent></Card></main>;
}

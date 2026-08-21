import { CalendarDays, ShieldCheck, Sparkles } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <main className="min-h-screen bg-[var(--background)] lg:grid lg:grid-cols-[1.08fr_0.92fr]">
    <section className="relative hidden overflow-hidden bg-[var(--primary)] p-12 text-[var(--primary-foreground)] lg:flex lg:flex-col">
      <div className="login-orb login-orb--one" />
      <div className="login-orb login-orb--two" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.09),transparent_45%,rgba(20,13,91,0.16))]" />
      <div className="relative z-10 flex items-center gap-3 font-display text-xl font-semibold"><span className="grid size-11 place-items-center rounded-2xl border border-white/20 bg-white/15 shadow-xl shadow-violet-950/15"><CalendarDays className="size-5" /></span>ShiftSaaS</div>
      <div className="relative z-10 my-auto max-w-xl">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-2 text-xs font-bold uppercase tracking-[0.15em] text-white/80 backdrop-blur"><Sparkles className="size-3.5" />Hours, without surprises</div>
        <h1 className="font-display text-5xl font-semibold leading-[1.06] tracking-tight xl:text-6xl">Plan every shift with your weekly limits in view.</h1>
        <p className="mt-7 max-w-lg text-lg leading-8 text-white/78">Track multiple jobs, schedule ahead, and get warnings before your planned hours become a problem.</p>
      </div>
      <p className="relative z-10 flex items-center gap-2 text-sm text-white/75"><span className="grid size-8 place-items-center rounded-xl bg-white/10"><ShieldCheck className="size-4" /></span>Your work schedule stays private.</p>
    </section>
    <section className="relative grid place-items-center overflow-hidden p-4 sm:p-8">
      <div className="pointer-events-none absolute left-1/2 top-8 size-72 -translate-x-1/2 rounded-full bg-[var(--primary)]/10 blur-3xl lg:hidden" />
      <Card className="relative w-full max-w-md border-[color-mix(in_srgb,var(--primary)_22%,var(--border))] bg-[var(--card)]/88 shadow-2xl shadow-black/10">
        <CardHeader>
          <div className="mb-4 flex size-11 items-center justify-center rounded-2xl bg-[var(--primary)] text-[var(--primary-foreground)] shadow-lg shadow-[var(--primary-glow)] lg:hidden"><CalendarDays className="size-5" /></div>
          <CardTitle className="text-xl">Welcome to ShiftSaaS</CardTitle>
          <CardDescription className="mt-1.5 leading-6">Sign in to manage your hours and upcoming shifts.</CardDescription>
        </CardHeader>
        <CardContent><LoginForm /></CardContent>
      </Card>
    </section>
  </main>;
}

import { CalendarDays, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <main className="grid min-h-screen lg:grid-cols-2"><section className="hidden bg-[var(--primary)] p-12 text-[var(--primary-foreground)] lg:flex lg:flex-col"><div className="flex items-center gap-3 text-xl font-bold"><span className="grid size-10 place-items-center rounded-xl bg-white/15"><CalendarDays /></span>ShiftSaaS</div><div className="my-auto max-w-lg"><p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-white/65">Hours, without surprises</p><h1 className="text-5xl font-bold leading-tight">Plan every shift with your weekly limits in view.</h1><p className="mt-6 text-lg text-white/75">Track multiple jobs, schedule ahead, and get warnings before your planned hours become a problem.</p></div><p className="flex items-center gap-2 text-sm text-white/70"><ShieldCheck className="size-4" />Your work schedule stays private.</p></section><section className="grid place-items-center p-4 sm:p-8"><Card className="w-full max-w-md"><CardHeader><div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] lg:hidden"><CalendarDays /></div><CardTitle>Welcome to ShiftSaaS</CardTitle><CardDescription>Sign in to manage your hours and upcoming shifts.</CardDescription></CardHeader><CardContent><LoginForm /></CardContent></Card></section></main>;
}

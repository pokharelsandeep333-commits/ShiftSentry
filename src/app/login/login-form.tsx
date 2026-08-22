"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GoogleMark, GitHubMark } from "@/components/ui/brand-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState(search.get("error") ? "We could not complete that sign-in. Please try again." : "");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const supabase = createClient();
      const result = mode === "signin"
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${location.origin}/auth/callback` } });

      if (result.error) setMessage(result.error.message);
      else if (mode === "signup" && !result.data.session) setMessage("Check your email to confirm your account, then sign in.");
      else router.replace("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function oauth(provider: "google" | "github") {
    setBusy(true);
    setMessage("");

    try {
      const { error } = await createClient().auth.signInWithOAuth({ provider, options: { redirectTo: `${location.origin}/auth/callback` } });
      if (error) setMessage(error.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to start sign-in.");
    } finally {
      setBusy(false);
    }
  }

  return <motion.form onSubmit={submit} className="space-y-4" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.35, ease: [0.16, 1, 0.3, 1] }}>
    <div><label className="mb-2 block text-sm font-semibold" htmlFor="email">Email</label><Input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></div>
    <div><label className="mb-2 block text-sm font-semibold" htmlFor="password">Password</label><Input id="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></div>
    {message && <p className="rounded-2xl border border-[color-mix(in_srgb,var(--primary)_20%,var(--border))] bg-[var(--primary-soft)] p-3 text-sm leading-6 text-[var(--muted-foreground)]">{message}</p>}
    <Button className="w-full" disabled={busy}>{busy && <LoaderCircle className="size-4 animate-spin" />}{mode === "signin" ? "Sign in" : "Create account"}</Button>
    <div className="relative py-2 text-center text-xs text-[var(--muted-foreground)] before:absolute before:left-0 before:right-0 before:top-1/2 before:border-t"><span className="relative bg-[var(--card)] px-3">or continue with</span></div>
    <div className="grid grid-cols-2 gap-3"><Button type="button" variant="outline" className="h-11" onClick={() => oauth("google")} disabled={busy}><GoogleMark />Google</Button><Button type="button" variant="outline" className="h-11" onClick={() => oauth("github")} disabled={busy}><GitHubMark />GitHub</Button></div>
    <p className="pt-2 text-center text-sm text-[var(--muted-foreground)]">{mode === "signin" ? "New to ShiftSentry?" : "Already have an account?"} <button type="button" className="font-semibold text-[var(--primary)] transition-opacity hover:opacity-75" onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); }}>{mode === "signin" ? "Create one" : "Sign in"}</button></p>
  </motion.form>;
}

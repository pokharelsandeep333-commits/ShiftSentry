"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ExternalLink, Moon, Search, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { legalLink } from "@/components/legal-page";
import { useTheme } from "@/components/theme-provider";
import type { LicenseCatalog, LicenseEntry, LicenseNotice } from "@/lib/license-types";

const PAGE_SIZE = 24;

function LicenseLinks({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]+\]\(https:\/\/[^\s)]+\))/g);
  return parts.map((part, index) => {
    const link = part.match(/^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/);
    return link ? <a key={index} href={link[2]} className={legalLink} target="_blank" rel="noopener noreferrer">{link[1]}<span className="sr-only"> (opens in a new tab)</span></a> : part;
  });
}

function NoticeContent({ url }: { url: string }) {
  const [texts, setTexts] = useState<LicenseNotice[] | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error("Notice unavailable");
      return response.json() as Promise<LicenseNotice[]>;
    }).then(setTexts).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [url, attempt]);

  if (error) return <div role="alert" className="space-y-3 text-sm"><p>This notice could not load. Try again or download the complete notices above.</p><Button variant="outline" size="sm" onClick={() => { setError(false); setAttempt((value) => value + 1); }}>Try again</Button></div>;
  if (!texts) return <p role="status" className="text-sm text-[var(--muted-foreground)]">Loading notice…</p>;
  if (!texts.length) return <p className="text-sm leading-6 text-[var(--muted-foreground)]">No separate notice file is bundled with this package. See its source for the license, or download the complete notices above.</p>;
  return <div className="space-y-6">{texts.map((notice, index) => <section key={`${notice.title}-${index}`}>
    <h3 className="mb-3 text-sm font-semibold">{notice.title}</h3>
    {notice.attributions && <dl className="mb-5 divide-y divide-[var(--border)]">{notice.attributions.map((library) => <div key={library.name} className="grid grid-cols-[minmax(0,1fr)] gap-1 py-3 text-sm leading-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,3fr)] sm:gap-4"><dt className="font-semibold">{library.name}</dt><dd className="break-words text-[var(--muted-foreground)]"><LicenseLinks text={library.license} /></dd></div>)}</dl>}
    <div role="region" aria-label={`${notice.title} text`} tabIndex={0} className="max-h-96 overflow-auto rounded-lg bg-[var(--surface-subtle)] p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] sm:p-5">
      <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-7 [overflow-wrap:anywhere]">{notice.text}</pre>
    </div>
  </section>)}</div>;
}

function LicenseRow({ entry }: { entry: LicenseEntry }) {
  const [open, setOpen] = useState(false);
  return <details className="group border-b border-[var(--border)] last:border-b-0" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 rounded-lg px-3 py-4 transition-colors hover:bg-[var(--primary-soft)] focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--primary)] [&::-webkit-details-marker]:hidden sm:px-5">
      <div className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold [overflow-wrap:anywhere] sm:text-base">{entry.name}</span>{entry.version && <span className="mt-1 block break-words text-xs tabular-nums text-[var(--muted-foreground)] [overflow-wrap:anywhere]">Version {entry.version}</span>}</div>
      <span className="max-w-[38%] break-words text-right text-xs font-medium leading-5 text-[var(--muted-foreground)] sm:text-sm">{entry.license}</span>
      <ChevronDown className="size-4 shrink-0 text-[var(--muted-foreground)] transition-transform group-open:rotate-180" aria-hidden="true" />
    </summary>
    <div className="space-y-5 px-3 pb-6 pt-2 sm:px-5">
      {entry.source && <a href={entry.source} target="_blank" rel="noopener noreferrer" className={`${legalLink} inline-flex min-h-11 items-center gap-2 text-sm`}>Project source<ExternalLink className="size-3.5" aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a>}
      {open && <NoticeContent url={entry.noticeUrl} />}
    </div>
  </details>;
}

export function LicenseBrowser({ catalog }: { catalog: LicenseCatalog }) {
  const [query, setQuery] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);
  const { theme, setTheme } = useTheme();
  const search = query.trim().toLowerCase();
  const matches = catalog.packages.filter((entry) => `${entry.name} ${entry.version} ${entry.license}`.toLowerCase().includes(search));
  return <div className="space-y-10">
    <section aria-labelledby="library-heading">
      <div className="mb-5 flex items-center justify-between gap-4"><h2 id="library-heading" className="font-display text-2xl font-semibold">Library licenses</h2><Button variant="ghost" size="icon" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun className="size-5" aria-hidden="true" /> : <Moon className="size-5" aria-hidden="true" />}</Button></div>
      <label htmlFor="license-search" className="sr-only">Search libraries or licenses</label>
      <div className="relative">
        <Input id="license-search" type="search" placeholder="Search libraries or licenses" value={query} onChange={(event) => { setQuery(event.target.value); setVisible(PAGE_SIZE); }} className="pr-12! text-base [&::-webkit-search-cancel-button]:appearance-none sm:text-sm" aria-describedby="license-results" />
        <Search className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" aria-hidden="true" />
      </div>
      <p id="license-results" role="status" aria-live="polite" aria-atomic="true" className="mb-4 mt-3 text-sm text-[var(--muted-foreground)]">{search ? `${matches.length} ${matches.length === 1 ? "library matches" : "libraries match"} your search` : `${catalog.packages.length} libraries. Select a library to read its notices.`}</p>
      {matches.length ? <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">{matches.slice(0, visible).map((entry) => <LicenseRow key={`${entry.name}@${entry.version}`} entry={entry} />)}</div> : <div className="rounded-2xl border border-[var(--border)] px-5 py-8"><h3 className="font-display text-lg font-semibold">No matching libraries</h3><p className="mb-4 mt-2 text-sm text-[var(--muted-foreground)]">Try a package name or a license such as MIT.</p><Button variant="outline" size="sm" onClick={() => { setQuery(""); setVisible(PAGE_SIZE); }}>Clear search</Button></div>}
      {matches.length > PAGE_SIZE && <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p role="status" className="text-sm tabular-nums text-[var(--muted-foreground)]">Showing {Math.min(visible, matches.length)} of {matches.length}</p><Button variant="outline" disabled={visible >= matches.length} onClick={() => setVisible(visible + PAGE_SIZE)}>{visible >= matches.length ? "All libraries shown" : `Show ${Math.min(PAGE_SIZE, matches.length - visible)} more libraries`}</Button></div>}
    </section>
    <section aria-labelledby="image-notices-heading">
      <h2 id="image-notices-heading" className="font-display text-2xl font-semibold">Image processing notices</h2>
      <p className="mb-5 mt-3 max-w-[65ch] text-sm leading-6 text-[var(--muted-foreground)]">Additional acknowledgments and full license texts for the native libraries used in image processing.</p>
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">{catalog.native.map((entry) => <LicenseRow key={entry.name} entry={entry} />)}</div>
    </section>
    <noscript><p className="text-sm leading-6">Enable JavaScript to search and expand individual notices, or use the complete notices download above.</p></noscript>
  </div>;
}

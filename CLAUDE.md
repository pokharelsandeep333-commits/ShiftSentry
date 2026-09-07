# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`AGENTS.md` holds the full contributor guidelines (style, PR/CI expectations, EC2 deployment and secret placement). Read it before touching CI, Docker, Nginx, or release behavior. This file covers what is not obvious from reading a single file.

The two files split by depth, not by topic: a rule that is expensive to get wrong — key naming, immutable migrations, the dual-layer business rules, no Radix Select, no animation library — is stated briefly in `AGENTS.md` and in full here. That overlap is deliberate, because `AGENTS.md` is what an agent without this file reads; when one of those rules changes, change it in both rather than deleting either copy.

## Commands

```bash
npm run dev                    # local app on http://localhost:3000
npm run test:earnings          # earnings, earnings-range, local-preference, period-totals, greeting, job-allocation, shift-date-time, time
npm run test:auth              # request-origin, validation
npm run test:game              # game (invite codes, imposter caps, start rules)
npm run test:sql               # applies every migration to a throwaway Postgres, then the suites in supabase/tests (needs Docker)
npx tsc --noEmit               # type-check
npm run lint                   # eslint (flat config)
npm run db:generate            # regenerate Prisma client after schema.prisma changes
npm run build                  # production build (output: standalone)
npm run audit:production       # prod-dependency audit gate used by CI
```

Run a single test file directly:

```bash
npx tsx --test src/lib/earnings.test.ts
```

Before a PR, run the test scripts, type-check, lint, and build — that mirrors the `quality` job in `.github/workflows/ci.yml`. `test:sql` is a separate CI job (`sql-tests`); `release` waits on both.

**Test scripts enumerate files explicitly.** A new `*.test.ts` will not run in CI until you add its path to `test:earnings`, `test:auth` or `test:game` in `package.json`. There is no glob.

`test:sql` is the exception, and inverts that rule: `scripts/run-sql-tests.sh` globs `supabase/tests/*.sql`, so a new suite runs the moment the file exists. Files run in filename order against one shared database, so they are numbered.

## Architecture

Next.js 16 App Router + React 19, Supabase Postgres with RLS, Prisma as a server-only admin client.

### Three database access paths, deliberately separated

| Path | Where | Key | Use |
| --- | --- | --- | --- |
| `createServerSupabaseClient()` | `src/lib/supabase/server.ts` | publishable, cookie-bound | **All user-facing reads/writes.** RLS scopes rows to the signed-in user. |
| `createAdminSupabaseClient()` | same file | `SUPABASE_SECRET_KEY` | Admin-only: role promotion, ban/unban, password-reset mail. |
| `prisma` | `src/lib/prisma.ts` | `DATABASE_URL` | Admin-only: audit events, admin user lookups. |

The admin client and Prisma bypass RLS. Never import either into a client component, and never reach for them because an RLS-scoped query is inconvenient — fix the policy instead.

`src/lib/supabase/client.ts` is the browser client (publishable key only). `database.types.ts` is the generated schema type shared by all three Supabase entry points.

### Auth flow

- `src/proxy.ts` is the Next.js 16 middleware equivalent (renamed from `middleware.ts`). It refreshes the Supabase session cookie on every matched request and guards `/admin` before the page renders.
- `src/app/auth/callback/route.ts` exchanges the OAuth code. It derives the redirect origin from `X-Forwarded-Host`/`X-Forwarded-Proto` via `publicRequestOrigin` because Nginx terminates TLS in production — changing that logic breaks OAuth on the live host. `safeInternalRedirect` blocks open-redirect via `?next=`.
- `getSignedInProfile()` (`src/lib/auth.ts`) lazily creates the `profiles` row on first sign-in and self-promotes to `ADMIN` when the email is in `ADMIN_EMAIL_ALLOWLIST`. Pages call `requireUser()` / `requireAdmin()`, which redirect rather than throw.
- The `(app)` route group is the signed-in boundary. Its layout calls `requireUser()` once per full load — not once per navigation, since a shared layout is not re-rendered when you move between its children, which is also what keeps the sidebar and bottom bar mounted while only the body swaps. `/login`, `/account-disabled` and `/offline` sit outside the group deliberately: they have to render without a session. The same layout falls back to `<AppShell isDemo>` when `isSupabaseConfigured()` is false, which is what lets the demo dashboard boot without credentials.
- `/api/health` is the only public API route: read-only, `no-store`, no database access.

### Business rules live in two enforced layers — keep them in sync

Server Actions (`src/app/actions/work.ts`) validate with Zod (`src/lib/validation.ts`) and compute earnings in TypeScript (`src/lib/earnings.ts`). Postgres triggers and constraints — introduced in `202608250004_business_rule_integrity.sql`, amended by `20260904143000_shift_pay_snapshot_and_overlap.sql` — independently enforce the *same* rules for any authenticated PostgREST write that skips the app:

- `sync_shift_earnings_snapshot` **overwrites all four `*_cents` columns** on every shift insert/update; values the action sends are advisory, the trigger is authoritative. It reads the job's current `hourly_rate_cents` / `tax_rate_basis_points` / deductions only on insert, or on an update that moves the shift to a different job. **An update that keeps the same job preserves the old snapshot** — a shift remembers what the work was worth when it was worked, so a later raise or a new deduction cannot reprice history through an unrelated edit. Re-applying a corrected rate has to be an explicit action, not a side effect of touching a note. `calculateEarnings()` in TS must match the trigger's rounding (`round(gross * rate / 10000)` per deduction, summed).
- `enforce_shift_weekly_limits` re-checks the ≤24h span, job ownership, and global/per-job weekly caps, taking `pg_advisory_xact_lock` per user so two concurrent shifts cannot race past a cap.
- `enforce_job_compensation_rate` keeps tax + deductions ≤ 100%.
- `shifts_no_overlap` (GiST exclusion over `user_id` + `tstzrange(starts_at, ends_at, '[)')`) rejects any two of one user's shifts that overlap, across jobs. The half-open range is load-bearing: back-to-back shifts touch without overlapping and stay legal. Requires the `btree_gist` extension.
- `shifts_no_duplicate_span` (unique index) rejects a second shift with the same `(user_id, job_id, starts_at, ends_at)`. Subsumed by `shifts_no_overlap` and kept deliberately — it is the narrower condition, so it yields the more specific "you already logged this exact shift" message.

Changing an earnings or limit rule means changing the TS helper, its test, **and** a new migration.

Because those rules live in the database, `npm test` cannot reach them. `supabase/tests/` covers that gap: `run-sql-tests.sh` starts a bare `postgres:17-alpine` container, applies `harness/stubs.sql` (stand-ins for the `auth` schema, the anon/authenticated/service_role roles and their default privileges, and `realtime.send`/`realtime.topic`), replays every migration **each in its own transaction** the way the CLI does, then plays against the result as `authenticated`. Reproducing the default privileges matters: without them the migrations' `revoke all ...` statements would be no-ops locally and the access-control assertions would pass for the wrong reason. Applying one transaction per file is what catches an enum value added and used in the same migration.

The user-local week-start expression is written out in three places that must stay identical: `enforce_shift_weekly_limits`, the `shift_week_count_before` function (`20260902034021_shift_week_numbering.sql`), and `weekStartFor()` in `src/lib/time.ts`.

### Money and time conventions

Money is integer cents; rates are integer basis points (10,000 = 100%). Parse user input with `parseMoneyToCents` / `parsePercentToBasisPoints` — never `parseFloat`.

Shifts are stored as UTC `timestamptz` but every total is computed in the user's IANA zone:

- `allocateShiftMinutes` (`src/lib/time.ts`) splits a shift at user-local midnights, preserving exact duration — an overnight shift contributes to two days.
- `weekStartFor` / `weekEndFor` honour the per-profile `week_starts_on` (0–6).
- **Archived jobs are excluded everywhere.** The dashboard shift query inner-joins `jobs!inner(...)` and filters `.is("jobs.archived_at", null)`, so an archived job drops out of weekly hours, weekly earnings, and the monthly chart together. Filtering at the query level is deliberate — doing it in TS previously let earnings leak while hours did not.
- `getDashboardData` (`src/lib/dashboard.ts`) issues exactly **two** shift queries, and adding a dashboard metric means extending one of the two passes rather than adding a third query:
  1. A windowed query spanning both the current week and the 6-month `monthlyAllocationWindow`, allocated per local day into weekly totals, earned-to-date (clipped at `now`), upcoming shifts, and the monthly chart.
  2. `fetchMonthTotals` — every shift already started, bucketed by calendar month via `bucketWorkedShiftsByMonth` (`src/lib/period-totals.ts`). Kept separate on purpose: a shift straddling the six-month boundary belongs to both ranges, so folding this into the windowed query would either double-count or drop it. PostgREST caps a response at 1,000 rows, so this one **pages** — a silently truncated page would under-report an all-time total with no error to notice.

### Totals are accumulated per slice, never per span

`src/lib/period-totals.ts` is the only place shift minutes turn into money for a period. Every caller feeds it minutes that were already split at local midnights and clipped at `now`, so each period rounds in exactly the same places. Totalling a whole span in one `calculateEarnings` call would round differently and the same shift would be worth a cent more under "all time" than under "this week" — the first thing anyone flipping the range picker would notice. `period-totals.test.ts` pins this.

Because the months are built that way, they sum: the server ships `totals.months` and the client re-totals any range (`combineMonthTotals` / `selectMonths` in `src/lib/earnings-range.ts`) with no further query. Month keys are `YYYY-MM` strings so ordering and range tests are plain string comparisons. Future shifts contribute nothing — the earnings trigger snapshots the whole span, so summing `net_cents` would report money nobody has earned yet.

### Rendering

Pages are server components (`export const dynamic = "force-dynamic"`). Mutations are Server Actions that `revalidatePath("/")` plus their own route. Client components are the interactive shells only — `grep -rl '"use client"' src` for the current set; the data fetching stays on the server.

Actions are split by privilege, and the split is the point: `work.ts` is user-scoped and goes through the RLS client, `admin.ts` uses the admin client plus Prisma and writes an `auditEvent` for every action it takes, and `auth.ts` holds sign-out. The password-reset abuse limit in `admin.ts` is a count over those audit rows (3 per actor/target per 15 minutes), so the rate limit and the audit trail are the same record.

An action that redirects away from the form it submitted carries a `?saved=<slug>` flag; `SavedToast` (`src/components/saved-toast.tsx`) fires the toast and then strips the flag with `replaceState`, so a refresh or a back-navigation does not replay it. Adding a mutation that redirects means adding its slug at both ends. `FormActionState` lives in `src/lib/form-state.ts` rather than beside the actions because a `"use server"` module may only export async functions — a shared initial-state constant cannot live there.

`src/app/page.tsx` renders `demoDashboard` (`src/lib/dashboard-demo.ts`) when Supabase env vars are absent, so the app boots without credentials. Keep that path working.

`src/lib/shift-date-time.ts` is pure parsing/formatting for the shift picker (accepts `MM/DD/YYYY hh:mm AM` and compact forms like `8262026530pm`) and is covered by tests — the picker component should not reimplement parsing.

The shift log pages by week rather than loading a history: `src/lib/shift-log.ts` clamps `?weeks=` identically for the page and for `deleteShift`'s hidden field, and the `shift_week_count_before` RPC returns the one integer needed to number weeks without shipping every row.

### Per-viewer preferences

`createLocalPreference` (`src/lib/local-preference.ts`) is the single path to a remembered client setting — the earnings range and the expanded weeks in the shift log both go through it. Two traps are solved there rather than at each call site: `read` caches its parse against the raw string (a `getSnapshot` returning a fresh object every call spins `useSyncExternalStore` without end), and a blocked store — private window, site data refused — falls back to the value written this session so the control still responds. The `revive` callback must return `null` for anything it does not recognise: stored values outlive deploys, so an entry from an older build has to degrade to the default.

Server render cannot read `localStorage`, so the first paint is always the default and the remembered choice arrives on the first client render. Keys are namespaced `shiftsentry:`.

### The service worker must never cache HTML

`public/sw.js` backs the offline shell, and its scope is narrow for a security reason rather than a performance one: every page is `force-dynamic` and rendered per signed-in user, so a cached document on a shared device could serve the next person the previous user's dashboard. HTML is therefore never written to the cache. Navigations are network-first and fall back to the static `/offline` page; only content-hashed `/_next/static/*` plus the icons and that offline page are cached, because a hashed URL never changes meaning and neither holds user data. Cross-origin requests (Supabase) and every non-GET are ignored outright, so auth calls and Server Action posts always reach the network. Widening any of those conditions needs a reason that survives the shared-device case.

`ServiceWorkerRegistrar` (`src/components/service-worker.tsx`) registers it in production only — in dev a worker in front of Turbopack turns HMR into a cache-invalidation puzzle. Bump `CACHE` when the precache list changes; `activate` deletes every other key.

## Constraints

- **Migrations are immutable.** Add a new timestamped file in `supabase/migrations/`; never edit or rerun an applied one. Production schema changes go through `supabase db push` in the release job — never `prisma migrate`. `prisma/schema.prisma` is a typed mirror of the SQL, not the source of truth.
- **Key naming.** Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` may reach the browser or a Docker build arg. Never introduce `SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY` — this repo uses the new `sb_publishable_` / `sb_secret_` keys with `@supabase/ssr` for cookie clients and `@supabase/server/core` for the admin client.
- **CSP is strict** (`next.config.ts`): `connect-src` allows only `'self'`, `https://*.supabase.co` and `wss://*.supabase.co` (the websocket entry is for the imposter game's Realtime channel and is spelled out rather than relying on CSP3's https-covers-wss rule, which Safari has been inconsistent about), `font-src 'self'` (fonts are bundled via `@fontsource-variable`). No external script, style, image, or font hosts — adding one requires a CSP change and a reason.
- **Design tokens** live in `src/app/globals.css` (`--primary`, `--surface-*`, `--primary-soft`, light/dark pairs). Build from `src/components/ui/` primitives before adding page-local styles.
- **Selects are in-house; Radix Select is gone.** `@radix-ui/react-dropdown-menu` is the only Radix package left, used by `account-menu.tsx` and `shift-row-actions.tsx`. `premium-select.tsx` is a hand-written ARIA listbox and its header documents the measurements behind that: Radix Select's portal, floating-ui `autoUpdate`, scroll lock, aria-hiding and focus guards cost 162ms worst-frame on `/shifts/new` against 39ms for the far larger in-house calendar popover. Do not reintroduce Radix Select, and do not reach for Radix DropdownMenu for a frequently-opened control — the dashboard range picker uses the listbox for that reason. Whatever you build must keep the full keyboard contract (arrows, Home/End, typeahead, Enter/Space, Escape, focus return) and must not be swapped for a native control.
- **No animation library.** Motion was removed deliberately — it felt laggy. `Reveal` (`src/components/ui/reveal.tsx`) is an intentional pass-through wrapper; do not restore animation to it, and do not add Motion back. If a transition is genuinely warranted, write it in CSS and respect `prefers-reduced-motion`.
- The `<!-- BEGIN:nextjs-agent-rules -->` block in `AGENTS.md` is written by `next dev`. Don't hand-edit or strip it; commit it with your work if it reappears. This Next.js version differs from older conventions — check `node_modules/next/dist/docs/` before assuming an API.

## Skills and MCP

Three vendored skills live in `.agents/skills/`, junction-linked into `.claude/skills/`. Both directories are gitignored; `skills-lock.json` is committed and records source + hash. Refresh with `npx skills add supabase/agent-skills`.

- **`supabase`** — any Supabase task: auth/session bugs, SSR clients, CLI, migrations, Edge Functions, log queries.
- **`supabase-postgres-best-practices`** — load *before* writing or changing anything in Postgres: schema, migrations, RLS policies, indexes, triggers, or diagnosing slow queries. Directly relevant here, since every business rule has a trigger counterpart.
- **`supabase-server`** — before touching code that imports `@supabase/server` / `@supabase/server/core` or configures an `auth:` mode. `src/lib/supabase/server.ts` uses `createAdminClient` from it.

`.mcp.json` declares the hosted Supabase MCP server (project `ajsuesxqsgkzjhxsnodf`, HTTP transport). It carries no secret and is committed. It requires per-user OAuth — approve it on first use, then authenticate via `/mcp` in an interactive terminal.

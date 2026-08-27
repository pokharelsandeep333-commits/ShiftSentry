# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`AGENTS.md` holds the full contributor guidelines (style, PR/CI expectations, EC2 deployment and secret placement). Read it before touching CI, Docker, Nginx, or release behavior. This file covers what is not obvious from reading a single file.

## Commands

```bash
npm run dev                    # local app on http://localhost:3000
npm run test:earnings          # earnings, greeting, job-allocation, shift-date-time
npm run test:auth              # request-origin, validation
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

Before a PR, run the two test scripts, type-check, lint, and build — that mirrors the `quality` job in `.github/workflows/ci.yml`.

**Test scripts enumerate files explicitly.** A new `*.test.ts` will not run in CI until you add its path to `test:earnings` or `test:auth` in `package.json`. There is no glob.

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

### Business rules live in two enforced layers — keep them in sync

Server Actions (`src/app/actions/work.ts`) validate with Zod (`src/lib/validation.ts`) and compute earnings in TypeScript (`src/lib/earnings.ts`). Postgres triggers in `supabase/migrations/202608250004_business_rule_integrity.sql` independently enforce the *same* rules for any authenticated PostgREST write that skips the app:

- `sync_shift_earnings_snapshot` **overwrites** `hourly_rate_cents`, `tax_rate_basis_points`, `deductions_snapshot`, and all four `*_cents` columns on every shift insert/update. Values the action sends are advisory; the trigger is authoritative. `calculateEarnings()` in TS must match its rounding (`round(gross * rate / 10000)` per deduction, summed).
- `enforce_shift_weekly_limits` re-checks the ≤24h span, job ownership, and global/per-job weekly caps, taking `pg_advisory_xact_lock` per user so two concurrent shifts cannot race past a cap.
- `enforce_job_compensation_rate` keeps tax + deductions ≤ 100%.
- `shifts_no_duplicate_span` (unique index) rejects a second shift with the same `(user_id, job_id, starts_at, ends_at)`. A double-click could outrun the form's `disabled={pending}` guard and double the logged hours; the weekly-limit trigger only caught it when a cap was set.

Changing an earnings or limit rule means changing the TS helper, its test, **and** a new migration.

### Money and time conventions

Money is integer cents; rates are integer basis points (10,000 = 100%). Parse user input with `parseMoneyToCents` / `parsePercentToBasisPoints` — never `parseFloat`.

Shifts are stored as UTC `timestamptz` but every total is computed in the user's IANA zone:

- `allocateShiftMinutes` (`src/lib/time.ts`) splits a shift at user-local midnights, preserving exact duration — an overnight shift contributes to two days.
- `weekStartFor` / `weekEndFor` honour the per-profile `week_starts_on` (0–6).
- **Archived jobs are excluded everywhere.** The dashboard shift query inner-joins `jobs!inner(...)` and filters `.is("jobs.archived_at", null)`, so an archived job drops out of weekly hours, weekly earnings, and the monthly chart together. Filtering at the query level is deliberate — doing it in TS previously let earnings leak while hours did not.
- `getDashboardData` (`src/lib/dashboard.ts`) issues one shift query spanning both the current week and the 6-month `monthlyAllocationWindow`, then allocates minutes per local day for weekly totals, earned-to-date (clipped at `now`), and the monthly chart. Adding a dashboard metric means extending that single pass, not adding a query.

### Rendering

Pages are server components (`export const dynamic = "force-dynamic"`). Mutations are Server Actions that `revalidatePath("/")` plus their own route. Client components are the interactive shells only — `shift-form.tsx`, `date-time-picker.tsx`, `premium-select.tsx`, `account-menu.tsx`.

`src/app/page.tsx` renders `demoDashboard` (`src/lib/dashboard-demo.ts`) when Supabase env vars are absent, so the app boots without credentials. Keep that path working.

`src/lib/shift-date-time.ts` is pure parsing/formatting for the shift picker (accepts `MM/DD/YYYY hh:mm AM` and compact forms like `8262026530pm`) and is covered by tests — the picker component should not reimplement parsing.

## Constraints

- **Migrations are immutable.** Add a new timestamped file in `supabase/migrations/`; never edit or rerun an applied one. Production schema changes go through `supabase db push` in the release job — never `prisma migrate`. `prisma/schema.prisma` is a typed mirror of the SQL, not the source of truth.
- **Key naming.** Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` may reach the browser or a Docker build arg. Never introduce `SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY` — this repo uses the new `sb_publishable_` / `sb_secret_` keys with `@supabase/ssr` for cookie clients and `@supabase/server/core` for the admin client.
- **CSP is strict** (`next.config.ts`): `connect-src` allows only `'self'` and `https://*.supabase.co`, `font-src 'self'` (fonts are bundled via `@fontsource-variable`). No external script, style, image, or font hosts — adding one requires a CSP change and a reason.
- **Design tokens** live in `src/app/globals.css` (`--primary`, `--surface-*`, `--primary-soft`, light/dark pairs). Build from `src/components/ui/` primitives before adding page-local styles. Radix Select and Dropdown Menu must stay keyboard-accessible; do not swap them for native controls.
- **No animation library.** Motion was removed deliberately — it felt laggy. `Reveal` (`src/components/ui/reveal.tsx`) is an intentional pass-through wrapper; do not restore animation to it, and do not add Motion back. If a transition is genuinely warranted, write it in CSS and respect `prefers-reduced-motion`.
- The `<!-- BEGIN:nextjs-agent-rules -->` block in `AGENTS.md` is written by `next dev`. Don't hand-edit or strip it; commit it with your work if it reappears. This Next.js version differs from older conventions — check `node_modules/next/dist/docs/` before assuming an API.

## Skills and MCP

Three vendored skills live in `.agents/skills/`, junction-linked into `.claude/skills/`. Both directories are gitignored; `skills-lock.json` is committed and records source + hash. Refresh with `npx skills add supabase/agent-skills`.

- **`supabase`** — any Supabase task: auth/session bugs, SSR clients, CLI, migrations, Edge Functions, log queries.
- **`supabase-postgres-best-practices`** — load *before* writing or changing anything in Postgres: schema, migrations, RLS policies, indexes, triggers, or diagnosing slow queries. Directly relevant here, since every business rule has a trigger counterpart.
- **`supabase-server`** — before touching code that imports `@supabase/server` / `@supabase/server/core` or configures an `auth:` mode. `src/lib/supabase/server.ts` uses `createAdminClient` from it.

`.mcp.json` declares the hosted Supabase MCP server (project `ajsuesxqsgkzjhxsnodf`, HTTP transport). It carries no secret and is committed. It requires per-user OAuth — approve it on first use, then authenticate via `/mcp` in an interactive terminal.

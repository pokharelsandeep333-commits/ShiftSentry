# Repository Guidelines

## Project Structure & Module Organization

ShiftSentry is a Next.js App Router app written in TypeScript. Routes, server actions, and callbacks live in **src/app/**; reusable UI is in **src/components/**, with primitives under **src/components/ui/**. Shared logic, types, validation, and integrations belong in **src/lib/**. Static files are in **public/**; versioned SQL migrations in **supabase/migrations/**; and the Prisma schema in **prisma/**.

## Build, Test, and Development Commands

- **npm install** — install dependencies.
- **npm run dev** — start the local app at http://localhost:3000.
- **npm run test:earnings** — run the Node test suite for earnings and time calculations.
- **npm run test:auth** — run request-origin and OAuth callback tests.
- **npx tsc --noEmit** — type-check the project without producing files.
- **npm run lint** — run the Next.js ESLint configuration.
- **npm run db:generate** — generate the Prisma client after schema changes.
- **npm run audit:production** — the production-dependency audit gate CI enforces.
- **npm run build** and **npm start** — create and serve a production build.

Before opening a pull request, run the earnings and auth tests, type-check, lint, and build commands. Copy **.env.example** to **.env.local**; never commit it or credentials.

## Coding Style & Naming Conventions

Use strict TypeScript and the **@/** alias for **src/** imports. Follow the existing style: two-space indentation, double quotes, semicolons, and named exports for shared helpers. Use PascalCase for components, camelCase for functions and values, and kebab-case route directories. Keep server-only database code in **src/lib/** or server actions; validate form input with Zod.

## Premium UI System

Preserve the existing purple design tokens in **src/app/globals.css** and build product UI from the shared primitives in **src/components/ui/** before adding page-specific styles. Use the local Inter body face and Outfit display face consistently; do not introduce a competing visual system or a cinematic effect that distracts from work.

This project ships no animation library; animations were removed because they felt laggy. `Reveal` in **src/components/ui/reveal.tsx** is an intentional pass-through wrapper—do not restore animation to it. If a transition is genuinely warranted, write it in CSS, respect **prefers-reduced-motion**, avoid video, particles, and cursor effects, and keep it responsive at mobile widths.

Radix Select was measured and removed; **@radix-ui/react-dropdown-menu** is the only Radix package still installed. Selects and the dashboard range picker use the in-house ARIA listbox in **src/components/ui/premium-select.tsx**, whose header records the measurements—do not reintroduce Radix Select or reach for Radix Dropdown Menu for a control that opens often. Every dropdown, Radix or in-house, must stay keyboard-accessible—Tab, arrow keys, Home/End, typeahead, Enter/Space, Escape, focus return, and click-outside behavior must continue to work—and must not be replaced with a native control in the premium workspace.

Tap targets reach 44px below the **sm** breakpoint and keep their compact desktop size above it; check `buttonVariants` as well as the shell when adding a control. Grid tracks use **minmax(0, …)** because grid items default to `min-width: auto`, and a long job name will otherwise push a card past its track and scroll the page sideways on a phone.

## Testing Guidelines

Tests use Node's built-in **node:test** runner via **tsx**. Place tests beside the module as **.test.ts**, such as **src/lib/earnings.test.ts**, and use descriptive behavior-based names. Update tests when changing earnings, time-zone, request-origin, authentication, validation, or other deterministic business logic. There is no coverage threshold.

The two test scripts in **package.json** enumerate their files explicitly—there is no glob—so a new **.test.ts** runs in CI only once its path is added to **test:earnings** or **test:auth**.

## Commit, Pull Request, and CI Guidelines

The existing history uses concise Conventional Commit-style subjects, for example **feat: add earnings tracking**. Use an imperative summary and keep unrelated changes separate. PRs should explain behavior and database/auth impact, list verification commands, and include UI screenshots when visual changes matter.

The GitHub Actions workflow protects **main** with Gitleaks, Prisma validation, earnings/auth tests, TypeScript, lint, production build, Docker verification, production dependency audit, and CodeQL. Dependency Review is intentionally PR-only. A green main run still waits for the protected **production** environment before it builds an immutable image, verifies and applies pending Supabase SQL migrations, and promotes that image to **stable**.

Update **README.md** and the Obsidian operations notes whenever CI jobs, release behavior, live EC2 paths, public routing, or secret placement changes. Do not describe unverified infrastructure as live.

## Production Deployment and Secrets

EC2 is the source of truth for live Compose and Nginx configuration: **/home/ubuntu/sandeepcloud/docker-compose.yml** and **/home/ubuntu/sandeepcloud/nginx.conf**. Nginx remains the only public ingress; ShiftSaaS exposes port 3000 only to the shared Compose network. Preserve the Cloudflare-origin TLS configuration, response-header buffers, and **Host**, **X-Forwarded-Proto**, and **X-Forwarded-Host** proxy headers because Supabase OAuth callbacks depend on them.

Never log, commit, or bake credentials into images. Only **NEXT_PUBLIC_SUPABASE_URL** and **NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY** may be Docker build arguments. Keep runtime secrets in the root-only EC2 environment file and Docker Hub pull credentials in the root-only Watchtower Docker config. Do not add a second Compose file, Nginx instance, public port 3000 mapping, or a second Watchtower service.

## Database & Security

Treat applied migrations as immutable; add a new timestamped migration instead of editing or rerunning one. User-facing access must use Supabase with row-level security. Production schema changes use Supabase SQL migrations through the verified release workflow—never Prisma migrate. **src/lib/prisma.ts** and the Supabase admin client using **SUPABASE_SECRET_KEY** are server-only administrative tools—never import them into browser components or expose their environment variables.

**Business rules are enforced twice, and the two layers must agree.** Server actions validate with Zod and compute earnings in TypeScript; Postgres triggers and constraints independently re-enforce the same earnings snapshot, weekly caps, compensation ceiling, and shift-overlap rules for any authenticated write that bypasses the app. Changing one of these rules means changing the TypeScript helper, its test, **and** adding a migration—never just one of the three. CLAUDE.md documents each rule and the places a single expression is deliberately duplicated.

Money is stored as integer cents and rates as integer basis points (10,000 = 100%). Parse user input with `parseMoneyToCents` / `parsePercentToBasisPoints`, never `parseFloat`. Shift totals are accumulated per local-day slice rather than per span, so every period rounds identically; **src/lib/period-totals.ts** is the only place minutes become money.

**Important SDK Rule:** This project uses **@supabase/ssr** for browser and cookie-backed server clients, plus the modern **@supabase/server/core** admin client. Never introduce legacy environment variables such as **SUPABASE_SERVICE_ROLE_KEY** or **SUPABASE_ANON_KEY**; use **NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY** and **SUPABASE_SECRET_KEY**.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

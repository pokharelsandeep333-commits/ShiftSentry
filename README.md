<h1 align="center">ShiftSaaS</h1>

<p align="center">
  Plan work with confidence. Track shifts, forecast weekly hours, and stay ahead of every limit.
</p>

<p align="center">
  <img alt="Next.js 16" src="https://img.shields.io/badge/Next.js-16.3-black?logo=nextdotjs" />
  <img alt="React 19" src="https://img.shields.io/badge/React-19-149eca?logo=react&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" />
  <img alt="Tailwind CSS v4" src="https://img.shields.io/badge/Tailwind_CSS-v4-38BDF8?logo=tailwindcss&logoColor=white" />
  <img alt="Supabase" src="https://img.shields.io/badge/Supabase-Auth_%2B_RLS-3ECF8E?logo=supabase&logoColor=white" />
  <img alt="Prisma" src="https://img.shields.io/badge/Prisma-7-2D3748?logo=prisma&logoColor=white" />
  <img alt="Motion" src="https://img.shields.io/badge/Motion-13-8B5CF6" />
  <img alt="Docker" src="https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white" />
</p>

## 📖 Overview

ShiftSaaS is a premium, responsive workspace for people balancing one or more jobs. It brings scheduled shifts, completed work, pay, deductions, and weekly limits into one calm view—so users can spot a problem before it becomes one.

| Capability | How it helps |
| --- | --- |
| **Track multiple jobs** | Keep job-specific colors, pay rates, deductions, and weekly caps organized in one workspace. |
| **Plan shifts ahead** | Add upcoming work and see it included in projected weekly hours. |
| **Stay under limits** | Get clear warnings at 80%, 90%, and 100% of global or per-job weekly caps. |
| **Understand earnings** | View gross pay, taxes, deductions, net earnings, and recent earnings history. |
| **Use secure sign-in** | Sign in with email, Google, or GitHub through Supabase Auth. |
| **Work comfortably anywhere** | Use the responsive dashboard, mobile navigation, keyboard-accessible controls, and light or dark themes. |

## 🛠️ Tech Stack

| Area | Technology |
| --- | --- |
| App framework | Next.js 16 App Router, React 19, TypeScript |
| Styling and interaction | Tailwind CSS v4, Motion, Radix Select and Dropdown Menu, Inter, Outfit |
| Data and authentication | Supabase Auth, PostgreSQL, Row Level Security, @supabase/ssr and @supabase/server |
| Server administration | Prisma 7 with PostgreSQL |
| Charts and dates | Recharts, date-fns, date-fns-tz |
| Validation and tests | Zod, Node.js test runner via tsx |
| Delivery | Docker, GitHub Actions, EC2, Cloudflare, Watchtower |

## 🏗️ Architecture

~~~mermaid
flowchart LR
  Browser[Browser] --> Next[Next.js App Router]
  Next --> Actions[Server actions and route handlers]
  Browser --> Auth[Supabase Auth]
  Actions --> Database[Supabase Postgres with RLS]
  Auth --> Database
  Admin[Server-only admin operations] --> Prisma[Prisma]
  Admin --> SecretClient[Supabase secret-key client]
  Prisma --> Database
  SecretClient --> Database
~~~

Browser-facing features use Supabase's publishable key and Row Level Security. Prisma and the secret-key client are server-only administrative tools; neither belongs in a browser bundle.

## 📁 Project Structure

~~~text
src/
├── app/                    App Router pages, actions, callback, and health route
├── components/             Shared dashboard, navigation, and UI primitives
├── lib/                    Auth, Supabase, validation, calculations, and types
prisma/                     Prisma schema
supabase/migrations/        Immutable timestamped production SQL migrations
.github/workflows/          CI, scheduled audit, and scheduled CodeQL workflows
~~~

## 🚀 Local Setup

### Prerequisites

- Node.js 24 or a compatible runtime supported by Next.js 16
- A Supabase project with email, Google, and GitHub sign-in enabled
- Docker, only if testing the production image locally

### 1. Install and configure

~~~powershell
npm install
Copy-Item .env.example .env.local
~~~

Fill in the five placeholders in **.env.local**. The two **NEXT_PUBLIC_SUPABASE_*** values are safe for the browser; **SUPABASE_SECRET_KEY**, **DATABASE_URL**, and **ADMIN_EMAIL_ALLOWLIST** are server-only. Never commit the file.

### 2. Configure Supabase Auth

Set the Supabase Auth **Site URL** to **https://sentry.sandeeppokharel.com.np** and add both application callbacks to the **Redirect URL allow list**:

~~~text
http://localhost:3000/auth/callback
https://sentry.sandeeppokharel.com.np/auth/callback
~~~

Enable Email, Google, and GitHub under **Authentication → Sign In / Providers**. Each OAuth provider points back to Supabase's provider callback, **https://&lt;project-ref&gt;.supabase.co/auth/v1/callback**; Supabase then redirects to this app's allowed callback.

### 3. Verify and run

~~~powershell
npm run db:generate
npm run test:earnings
npm run test:auth
npx tsc --noEmit
npm run lint
npm run build
npm run dev
~~~

Open [http://localhost:3000](http://localhost:3000). Without Supabase configuration, the root route intentionally renders a read-only dashboard preview.

## 🗃️ Database Migrations

The immutable Supabase SQL migrations in [supabase/migrations](supabase/migrations/) are the database source of truth:

~~~text
202608200001_initial_schema.sql
202608200002_earnings_tracking.sql
202608200003_security_auth_hardening.sql
~~~

For a fresh development database, apply them in timestamp order. For production, GitHub Actions compares the repository history with Supabase, previews pending migrations, and applies only verified new SQL migrations after release approval. Never use Prisma migrate, edit an applied migration, rerun the initial schema, or reset the production database.

## 🔁 Pull Requests and CI/CD

~~~mermaid
flowchart LR
  Branch[Feature branch] --> PR[Pull request to main]
  PR --> Checks[CI quality and security checks]
  Checks --> Merge[Merge to main]
  Merge --> Approval[GitHub production approval]
  Approval --> Image[Push immutable SHA image]
  Image --> Migration[Verify and apply pending Supabase SQL]
  Migration --> Stable[Promote exact image to stable]
  Stable --> Watchtower[EC2 Watchtower pulls and restarts ShiftSaaS]
~~~

### Daily pull-request workflow

~~~powershell
git switch main
git pull --ff-only origin main
git switch -c codex/short-change-name

# Make the change, then run the same main checks locally.
npm run db:generate
npm run test:earnings
npm run test:auth
npx tsc --noEmit
npm run lint
npm run build

git status
git add <changed-files>
git commit -m "docs: describe the change"
git push -u origin codex/short-change-name
~~~

Create a pull request from that branch to **main** in GitHub. Review the Actions results, address any failure in a new commit, and merge only after the required checks are green.

If the GitHub CLI is installed and authenticated, this optional command opens the same PR:

~~~powershell
gh pr create --base main --head codex/short-change-name --fill
~~~

| Trigger | What runs |
| --- | --- |
| Pull request to **main** | Gitleaks, Prisma generation/validation, earnings and auth tests, TypeScript, lint, production build, Docker build verification, production dependency audit, Dependency Review, and CodeQL. |
| Push to **main** | All shared gates except PR-only Dependency Review, followed by the protected production release job. |
| Weekly schedules | Dependabot opens update PRs for npm, Docker, and GitHub Actions; dependency audit runs Monday; CodeQL runs Wednesday. |

The release job waits for the GitHub **production** environment approval, pushes **sha-&lt;commit&gt;**, runs **supabase migration list**, runs **supabase db push --dry-run**, applies only verified pending migrations, and promotes that exact image to **stable**. Watchtower checks the private image every five minutes. Dependabot does not deploy or migrate the database by itself.

## 🔐 Secret Boundaries

| Location | Permitted values |
| --- | --- |
| Docker build arguments | **NEXT_PUBLIC_SUPABASE_URL**, **NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY** only |
| GitHub production secrets | Docker Hub username/token, both public Supabase values, **SUPABASE_DB_URL** for migration checks |
| EC2 runtime environment | Both public values plus **SUPABASE_SECRET_KEY**, **DATABASE_URL**, and **ADMIN_EMAIL_ALLOWLIST** |
| EC2 Watchtower Docker config | A separate Docker Hub pull-only token |

**NEXT_PUBLIC_*** values are intentionally embedded in the browser build and are not secrets. The secret key, database URL, Docker tokens, and administrator allowlist must never be committed, printed in CI logs, passed as Docker build arguments, or stored in image layers.

## 🐳 Docker and EC2

Build the production image locally with only browser-safe build arguments:

~~~powershell
$env:NEXT_PUBLIC_SUPABASE_URL = "https://your-project.supabase.co"
$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_your_key"
docker build --build-arg NEXT_PUBLIC_SUPABASE_URL="$env:NEXT_PUBLIC_SUPABASE_URL" --build-arg NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$env:NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" --tag shiftsaas:local .
docker run --env-file .env.local -p 3000:3000 shiftsaas:local
~~~

The live EC2 configuration source is intentionally outside this repository:

~~~text
/home/ubuntu/sandeepcloud/docker-compose.yml
/home/ubuntu/sandeepcloud/nginx.conf
~~~
---

Built for clearer weeks, calmer planning, and better work-life boundaries.

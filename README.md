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

~~~
---

Built for clearer weeks, calmer planning, and better work-life boundaries.

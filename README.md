# ShiftSaaS

ShiftSaaS helps people plan multiple jobs, log shifts, and stay below global and per-job weekly hour caps. Future shifts are included in projected totals, and the dashboard warns at 80%, 90%, and 100%.

## Local setup

1. Copy `.env.example` to `.env.local` and set the Supabase values. Do not commit this file.
2. In the Supabase Dashboard, open **SQL Editor → New query** and run `supabase/migrations/202608200001_initial_schema.sql` once. Then run `supabase/migrations/202608200002_earnings_tracking.sql` once. Do not rerun either migration after it succeeds.
3. In Supabase Auth, enable Email, Google, and GitHub, with `http://localhost:3000/auth/callback` as a redirect URL.
4. In **Authentication → URL Configuration**, set the Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/callback` as a redirect URL. Enable Email, Google, and GitHub in **Authentication → Sign In / Providers**. Google and GitHub OAuth apps must use Supabase’s provider callback (`https://<project-ref>.supabase.co/auth/v1/callback`), while this app callback remains in the Supabase redirect allowlist.
5. Add the initial administrator email to `ADMIN_EMAIL_ALLOWLIST`.
6. Run `npm run db:generate`, `npm run test:earnings`, and `npm run dev`.

Without Supabase configuration, the root route renders a read-only dashboard preview. Authenticated pages require Supabase.

## Database boundaries

- Browser and user-facing server actions use Supabase with row-level security.
- `src/lib/prisma.ts` is server-only and uses the direct database URL for administration.
- Admin route access is checked in the proxy and again in every privileged server route/action.

## Deployment to EC2

Build and run the production image:

```bash
docker build -t shiftsaas .
docker run --env-file .env.local -p 3000:3000 shiftsaas
```

Put the application behind HTTPS (for example, Nginx or an AWS load balancer), set the production auth callback URL in Supabase, and supply all server-only environment variables through your EC2 secret-management process.

## Verification

```bash
npm run db:generate
npx tsc --noEmit
npm run lint
npm run build
```

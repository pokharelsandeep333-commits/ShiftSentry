# ShiftSentry Security Audit

**Date:** 2026-08-25
**Scope:** Local codebase, versioned migrations, dependency manifest, and Dockerfile only. No production systems, external Supabase project, real accounts, or real user data were accessed.

## Verification boundary

The configured Supabase URL is an external project, so no live database, authentication, RLS, or account tests were run against it. Docker was unavailable locally, which prevented starting an ephemeral Postgres test database. Findings marked **migration retest pending** must be applied and exercised in a local Supabase/test database before release.

Completed local checks:

- `npm run test:earnings` — passed (9 tests)
- `npm run test:auth` — passed (5 tests, including new redirect and malformed-ID cases)
- `npx tsc --noEmit` — passed
- `npm run lint` — passed with one existing `react-hooks/exhaustive-deps` warning in `src/components/app-shell.tsx`
- `npx prisma validate` — passed
- `npm run build` — passed
- `npm run audit:production` — could not obtain an advisory report because the npm audit endpoint failed

## Findings

### Critical

No critical findings identified in the reviewed code.

### High

No high findings identified in the reviewed code.

### Medium

#### M-1 — OAuth callback accepted protocol-relative external redirects — fixed

- **File/route:** `src/app/auth/callback/route.ts`
- **Attack scenario:** An attacker could send a sign-in link containing `next=//attacker.example`. `new URL()` treats that value as an external URL, causing a successful OAuth sign-in to redirect the user to an attacker-controlled site. This can enable convincing post-login phishing.
- **Evidence:** The callback previously accepted every value beginning with `/`; protocol-relative URLs also begin with `/`.
- **Fix:** `safeInternalRedirect()` now parses against a fixed internal origin and returns only same-origin path, query, and fragment values. Absolute, protocol-relative, malformed, and backslash-normalized external URLs fall back to `/`.
- **Retest result:** Passed local tests for a valid relative destination, `//attacker.example`, `/\\attacker.example`, and an absolute external URL.

#### M-2 — Weekly caps and earnings snapshots could be bypassed by direct authenticated database writes — fixed; migration retest pending

- **Files:** `supabase/migrations/202608200001_initial_schema.sql`, `supabase/migrations/202608200003_security_auth_hardening.sql`, new `supabase/migrations/202608250004_business_rule_integrity.sql`
- **Attack scenario:** RLS correctly limited a user to their own jobs and shifts, but it intentionally allowed direct authenticated inserts and updates. A user could submit a self-owned shift through PostgREST with hours over a configured global or per-job weekly limit, or supply manipulated earnings snapshot columns.
- **Evidence:** Existing policies enforced ownership and job ownership but had no database trigger for weekly limits, combined tax/deduction rates, or derived earnings fields. Dashboard code only displayed 80/90/100% alerts.
- **Fix:** The new migration adds trigger-only functions that:
  - reject shifts over global and per-job weekly limits in the profile’s time zone, including across week boundaries;
  - serialize same-user shift writes with a transaction advisory lock to prevent cap-race bypasses;
  - regenerate shift pay snapshots and earnings from the selected job and deductions;
  - reject combined tax plus deductions above 100%; and
  - revoke direct execution of trigger helpers from public, anonymous, and authenticated roles.
- **Retest result:** Type-check and production build pass. Runtime migration/SQL proof-of-concept is pending a local test database; no external database was used.

#### M-3 — No application security-header policy — fixed

- **File:** `next.config.ts`
- **Attack scenario:** Without a CSP, anti-framing policy, MIME-sniffing prevention, referrer controls, and permissions policy, a future XSS or clickjacking weakness would have a larger impact.
- **Evidence:** The configuration previously only declared standalone output.
- **Fix:** Added CSP (`frame-ancestors 'none'`, restricted sources, Supabase-only browser connections), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, referrer and permissions policies, cross-origin opener policy, DNS-prefetch control, and production HSTS.
- **Retest result:** Production build loaded the new configuration successfully, and a local production-build request to `/api/health` returned the CSP, frame, MIME, referrer, permissions, opener, DNS-prefetch, and HSTS headers.

### Low

#### L-1 — Admin password-reset action had no application-level abuse limit — fixed

- **File:** `src/app/actions/admin.ts`
- **Attack scenario:** A compromised administrator session could repeatedly trigger reset emails for the same account.
- **Evidence:** The action performed the reset immediately after the role check, with no local limit.
- **Fix:** The action now permits at most three reset requests by the same administrator for the same target in 15 minutes, using the existing immutable application audit event store.
- **Retest result:** Type-check and production build pass. A live mail/reset test was intentionally not run.

#### L-2 — Several mutation identifiers were accepted as arbitrary strings and database error text was surfaced by actions — fixed

- **Files:** `src/lib/validation.ts`, `src/app/actions/work.ts`, `src/app/actions/admin.ts`
- **Attack scenario:** Malformed direct Server Action calls could reach database filters and return unnecessary implementation-specific failures. No SQL injection was found because Supabase/Prisma parameterize values.
- **Evidence:** Delete/archive/pay actions used `String(formData.get("id"))` or `String(formData.get("userId"))` without UUID parsing.
- **Fix:** Added a shared UUID schema for resource identifiers and replaced raw database action failures with generic user-facing messages.
- **Retest result:** New local test rejects malformed and SQL-injection-shaped IDs; test suite passes.

#### L-3 — Login and public-auth rate-limit settings are not verifiable from this repository — open configuration item

- **Area:** Supabase Auth dashboard
- **Evidence:** Browser login and sign-up call Supabase Auth directly. The repository contains no local Auth rate-limit configuration.
- **Required verification:** In a local/test Supabase project, confirm enabled-email, password, OAuth, and reset rate limits, CAPTCHA/abuse controls if appropriate, and allowed redirect URLs. Do not infer production settings from code.

## Control status

| Area | Status | Evidence |
| --- | --- | --- |
| SQL injection | Pass | One Prisma tagged `SELECT 1` health query; no unsafe raw-query APIs or string-built SQL found. Prisma and Supabase filters are parameterized. |
| Authentication | Pass in code; live config pending | Server uses `auth.getUser()`, proxy refreshes session cookies, and callback exchanges codes server-side. Expired-session behavior requires a local Auth test. |
| Authorization / IDOR | Pass in code | User actions derive identity from `requireUser()` and scope rows to that identity; admin pages/actions also call `requireAdmin()` server-side. |
| Supabase RLS | Pass by migration review; live retest pending | Profiles, jobs, shifts, deductions, and audit events have RLS policies; shifts also require an owned job. |
| API / Server Actions | Pass with fixes | Only public API route is read-only health. Every state-changing Server Action authenticates; admin actions require server-side admin status. |
| Input validation | Pass with fixes | Zod validates settings, jobs, deductions, and shifts; resource IDs now require UUIDs. |
| XSS | Pass by source review | No `dangerouslySetInnerHTML`, raw HTML insertion, `eval`, or script URL sinks found. React escapes rendered user text. |
| CSRF | Pass by framework/config review | Next Server Actions enforce Origin-to-Host/X-Forwarded-Host checks. Preserve the documented proxy headers in deployment. |
| Secrets | Pass by source review | No tracked real secret patterns found. Secret-key use is confined to server modules; no server client imports were found in client components. |
| Error handling | Improved | Sensitive mutation errors are now generic to callers. Login displays Auth-provider messages by design. |
| Uploads | Not applicable | No upload/storage implementation was found. |
| Dependencies | Inconclusive | Production audit could not reach npm’s advisory endpoint; rerun in a network-enabled CI environment. |
| Docker / deployment | Pass by Dockerfile review; runtime pending | Multi-stage image runs as non-root `nextjs` user and exposes only port 3000. EC2 Compose/Nginx configuration was not present for local inspection. |
| Business logic | Fixed; migration retest pending | Database migration now enforces caps, compensation consistency, and snapshots beyond the UI. Future shifts remain intentionally supported and counted. |
| Audit logging | Pass by source review | Admin disable/enable/reset events record actor, target, action, and database timestamp; ordinary users cannot read, modify, or delete audit events through RLS. |

## Prioritized follow-up

1. Apply `202608250004_business_rule_integrity.sql` to a disposable local/test Supabase database and run two-user RLS/IDOR and cap-bypass regression tests before release.
2. Verify Supabase Auth’s redirect allowlist and authentication/reset rate-limit settings in the test project.
3. Restore npm registry access and run `npm run audit:production` in CI; update any reported production dependencies through normal review.
4. Consider a nonce-based CSP later if stricter protection against inline-script XSS is required; the current policy is a compatible baseline for the existing app.

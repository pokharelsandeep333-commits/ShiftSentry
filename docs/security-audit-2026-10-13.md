# Security audit: Cloudflare edge and application (2026-10-13)

Scope: the code in this repository at `3244f74` (Next.js 16 app, the Supabase migrations and RLS, the Google Calendar integration, the CI/release workflows), looked at with the production path in mind: **browser → Cloudflare → Nginx on EC2 → app container**, and **browser → Supabase** directly.

Method: source review only. No deployed endpoint, Cloudflare zone, Supabase project or EC2 host was probed, and no target code was run. A finding marked *needs validation* depends on configuration that lives outside this repository (Cloudflare dashboard, Nginx, Supabase project settings).

## Summary

| ID | Title | Severity | Status |
| --- | --- | --- | --- |
| CF-1 | Origin may be reachable without going through Cloudflare | Medium if open | Needs validation |
| CF-2 | `X-Forwarded-Host` / `-Proto` trusted from any client | Low | Confirmed in code; impact depends on Nginx |
| CF-3 | Cloudflare features that inject scripts conflict with the nonce CSP | Informational | Needs validation |
| CF-4 | Cloudflare cache rules must never cache HTML or `/account/export` | Informational | Needs validation |
| CF-5 | Auth abuse controls sit at Supabase, not Cloudflare | Informational | By design |

**I found no confirmed vulnerability that lets one user read or change another user's data, or gain admin.** The database layer (RLS, restrictive lock-out policies, security-definer RPCs with `search_path = ''`, column grants, the privilege-change trigger) and the app layer (nonce CSP with `strict-dynamic`, safe redirects, PKCE plus state for Google, AES-GCM tokens bound to the user id, fresh-AMR checks before deletion) hold up against the paths I traced.

---

## CF-1: Origin may be reachable without going through Cloudflare (needs validation)

**Evidence.** `docs/privacy-operations.md` puts the app on an EC2 host in `us-east-1` behind Nginx. The release job notes that GitHub-hosted runners get HTTP 403 "at the public edge" (`.github/workflows/ci.yml`, end of the `release` job), so Cloudflare WAF or bot rules are doing work. Nothing in the repo shows the origin refusing traffic that does not come from Cloudflare.

**Why it matters.** If the EC2 public IP or another DNS name answers on 80/443, an attacker can skip every Cloudflare control: WAF, bot fight, rate limiting, and the 403 rule above. The app's own limiters are per-process and keyed on user id (`src/lib/rate-limit.ts`), so they do nothing against unauthenticated floods.

**Safe check (owner only).** From outside Cloudflare, run `curl -skI --resolve <host>:443:<EC2-public-IP> https://<host>/api/health`. A `200` means the origin is open. Also look for the origin IP in historical DNS and certificate-transparency records.

**Fix (smallest first).**
1. Security group: allow 443 only from the published Cloudflare IP ranges (https://www.cloudflare.com/ips/). Or use Cloudflare Tunnel and close inbound 80/443 entirely.
2. Turn on **Authenticated Origin Pulls** (mTLS) and have Nginx require it with `ssl_verify_client on`.
3. Set SSL/TLS mode to **Full (strict)**.

## CF-2: Forwarded host and protocol trusted from any client (Low)

**Evidence.** `src/lib/request-origin.ts:5` `publicRequestOrigin()` builds the public origin from the first `X-Forwarded-Host` / `X-Forwarded-Proto` value without checking it against a known host. It is used for redirects in `src/app/auth/callback/route.ts`, for the Google `redirect_uri` in `src/app/integrations/google/{connect,callback}/route.ts`, and in the same-site fallback in `.../sync/route.ts`.

Cloudflare sets `X-Forwarded-Proto` and `X-Forwarded-For` but **passes a client-supplied `X-Forwarded-Host` through unchanged**. So the header can be trusted only if Nginx overwrites it.

**Impact today: low.** A browser cannot attach this header to a cross-site navigation, so an attacker can only change the redirects on their own requests. Google rejects any `redirect_uri` that is not registered, so OAuth codes cannot be redirected elsewhere. Cache poisoning would need Cloudflare to cache `/auth/callback` redirects, which it does not do by default (see CF-4). The risk is that this becomes exploitable if a cache rule or another proxy is added later.

**Fix.**
- Nginx: `proxy_set_header X-Forwarded-Host $host;` and `proxy_set_header X-Forwarded-Proto https;`, plus a `default_server` block that returns `444` for unknown `Host` values.
- Optional code hardening: add a server-only `PUBLIC_APP_ORIGIN` (for example `https://sentry.sandeeppokharel.com.np`) and have `publicRequestOrigin()` return it whenever it is set. Behaviour without the variable stays as it is now, so local development is unaffected.

## CF-3: Script-injecting Cloudflare features vs. the nonce CSP (informational)

`src/lib/content-security-policy.ts` allows scripts only by per-request nonce plus `'strict-dynamic'`. Any script Cloudflare injects at the edge carries no nonce, so the browser refuses to run it. That is the correct security outcome, but it can break or quietly disable features:

- **Rocket Loader**: rewrites every script tag and will break the app. Keep it **off**.
- **Email Address Obfuscation**: the legal pages show `contact@…`. The decoder script is blocked, so visitors would see `[email protected]`. Turn it off, or disable it for this hostname with a Configuration Rule.
- **Web Analytics beacon**: already noted in `docs/privacy-operations.md`. It is blocked by `script-src`, and `connect-src` does not allow `cloudflareinsights.com`. Do **not** fix this by adding `'unsafe-inline'` or dropping `'strict-dynamic'`. The Supabase auth cookie is not HttpOnly, so the CSP is what keeps an injected script from reading tokens.

## CF-4: Cache rules (informational)

Every signed-in page is per-user (`force-dynamic`), and `/account/export` returns the user's full data with `Cache-Control: private, no-store`. Cloudflare's default (caching by file extension only) is safe. A **"Cache Everything"** rule, or an "Edge Cache TTL" override that ignores origin headers, on `/*`, `/account/*`, `/auth/*` or `/integrations/*` would serve one user's data or session-setting redirects to others. Limit any cache rule to `/_next/static/*` and the icons.

## CF-5: Auth abuse controls are at Supabase (by design)

Password sign-in, sign-up and reset go from the browser straight to `*.supabase.co`, so Cloudflare WAF and rate limits never see them. Brute-force and enumeration protection therefore comes from the Supabase project's Auth rate limits and CAPTCHA settings. `supabase/config.toml` only covers local development. Check in the Supabase dashboard that **Confirm email** is on (admin auto-promotion in `src/lib/auth.ts` relies on the JWT `email` being verified), and consider turning on Turnstile/CAPTCHA for sign-up and password reset.

---

## Paths traced that held

- **Tenant isolation:** owner RLS on every personal table, `restrictive` lock-out policies for disabled or deleting accounts, and a trigger that rejects shifts on another user's job. Server actions also filter by `user_id`.
- **Privilege escalation:** `prevent_profile_privilege_changes` blocks self-edits of `role`, `disabled_at` and `email`. There is no `INSERT` policy on `profiles`, and `deletion_pending_at` is guarded by `require_legal_write`. Admin pages and actions call `requireAdmin()` and do not rely on the proxy alone; the proxy matcher skips paths ending in `.png` and similar.
- **Game secrecy:** all writes go through security-definer RPCs, `game_round_secrets` has no select grant, and votes are hidden until the reveal.
- **Open redirect:** `safeInternalRedirect` covers `//`, `/\` and dot-segment collapse. `legalDestination` runs on top of it.
- **CSRF:** Server Actions get Next's Origin check. The sync route requires `Sec-Fetch-Site: same-origin`. Google connect uses state and PKCE with the state bound to the user id.
- **Secrets:** tokens use AES-256-GCM with the user id as AAD, and error logs record only error names. CI pins actions to SHAs, runs Gitleaks, CodeQL and `npm audit`, and keeps production secrets behind the `production` environment.

## Recommended order

1. Check and close the origin (CF-1). This is the only item that could matter at Medium severity.
2. Have Nginx overwrite the forwarded headers and add a default-server catch-all (CF-2).
3. Confirm Rocket Loader and Email Obfuscation are off and no cache rule covers dynamic paths (CF-3, CF-4).
4. Confirm Supabase "Confirm email" is on and consider CAPTCHA (CF-5).

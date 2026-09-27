/**
 * The one Content-Security-Policy, built per request by `src/proxy.ts` and once,
 * without a nonce, by `next.config.ts` for the paths the proxy does not match.
 *
 * Scripts are allowed by nonce, not by `'unsafe-inline'`. The Supabase session
 * cookie is not HttpOnly -- the browser client has to read it -- so an injected
 * inline script could lift the access and refresh tokens from `document.cookie`.
 * With a nonce it never runs: an attacker cannot know a value minted fresh for
 * every response. Next.js stamps the nonce onto its own scripts by reading it
 * back out of the request's CSP header; the theme bootstrap in the root layout
 * takes it from `x-nonce`.
 *
 * `'strict-dynamic'` lets those nonced scripts load the hashed chunks without
 * listing hosts. It also makes `'self'` inert for scripts in CSP3 browsers --
 * `'self'` stays for older ones -- which is why `worker-src` is spelled out:
 * without it the service worker registration falls back to `script-src` and is
 * refused.
 *
 * Without a nonce (the static fallback) no inline script is allowed at all.
 * That is correct for what the proxy skips -- hashed chunks, icons, `/api/health`
 * -- none of which is a document with inline script in it.
 *
 * Styles keep `'unsafe-inline'`: `style={{ ... }}` attributes are everywhere and
 * a nonce cannot cover an attribute. Adding a nonce to `style-src` would also
 * switch `'unsafe-inline'` off there, so it is deliberately left out.
 */
export function contentSecurityPolicy({ nonce, supabaseUrl, development }: { nonce?: string; supabaseUrl?: string; development: boolean }): string {
  const scriptSources = ["'self'", ...(nonce ? [`'nonce-${nonce}'`, "'strict-dynamic'"] : []), ...(development ? ["'unsafe-eval'"] : [])];

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "worker-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${["'self'", ...supabaseOrigins(supabaseUrl)].join(" ")}`,
  ].join("; ");
}

/**
 * The project's own origin, not `*.supabase.co`: a wildcard would let a script
 * that did get in post whatever it read to any Supabase project, including one
 * the attacker owns. `wss:` is named separately for the Realtime socket because
 * Safari has been inconsistent about letting an https source cover it.
 */
function supabaseOrigins(supabaseUrl: string | undefined): string[] {
  if (!supabaseUrl) return [];
  try {
    const url = new URL(supabaseUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return [];
    return [url.origin, `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`];
  } catch {
    return [];
  }
}

/** Fresh per response. 128 bits from `randomUUID`, base64 as the CSP grammar wants. */
export function createNonce(): string {
  return btoa(crypto.randomUUID());
}

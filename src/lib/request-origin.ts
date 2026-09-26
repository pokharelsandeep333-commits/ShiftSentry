function firstForwardedValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

export function publicRequestOrigin(request: Request) {
  const fallback = new URL(request.url);
  const forwardedHost = firstForwardedValue(request.headers.get("x-forwarded-host"));
  const forwardedProtocol = firstForwardedValue(request.headers.get("x-forwarded-proto"));

  if (!forwardedHost) return fallback.origin;

  try {
    const protocol = forwardedProtocol === "https" ? "https" : fallback.protocol.replace(":", "");
    const origin = new URL(`${protocol}://${forwardedHost}`);
    return origin.host === forwardedHost && origin.pathname === "/" ? origin.origin : fallback.origin;
  } catch {
    return fallback.origin;
  }
}

/**
 * Where to send someone after an OAuth or confirm-email round trip, set by the
 * login form and read once by the callback. A cookie rather than a query
 * parameter on `redirectTo` because the allow list matches the whole URL.
 */
export const NEXT_COOKIE = "shiftsentry-next";

/** A path a browser reads as same-origin: one leading slash, not `//` or `/\`. */
function isOriginRelativePath(value: string) {
  return /^\/(?![/\\])/.test(value);
}

export function safeInternalRedirect(value: string | null, fallback = "/") {
  // Only a path is accepted, never an absolute URL -- even one naming the
  // placeholder origin below, which would otherwise pass the origin check.
  if (!value || !isOriginRelativePath(value)) return fallback;

  try {
    const base = "https://internal.invalid";
    const url = new URL(value, base);
    const path = `${url.pathname}${url.search}${url.hash}`;
    // Checked again after parsing, because dot segments collapse: "/.//evil.com"
    // normalizes to "//evil.com", which both `new URL(next, origin)` and the
    // client router resolve to another host.
    return url.origin === base && isOriginRelativePath(path) ? path : fallback;
  } catch {
    return fallback;
  }
}

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

export function safeInternalRedirect(value: string | null, fallback = "/") {
  if (!value) return fallback;

  try {
    const base = "https://internal.invalid";
    const url = new URL(value, base);
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : fallback;
  } catch {
    return fallback;
  }
}

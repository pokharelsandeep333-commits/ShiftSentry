import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";
import { SESSION_HEADER } from "./lib/session-context";

/** The request headers the proxy forwards to the page, as Next encodes them on the response. */
function forwardedHeaders(response: Response) {
  const names = (response.headers.get("x-middleware-override-headers") ?? "").split(",").filter(Boolean);
  return new Map(names.map((name) => [name, response.headers.get(`x-middleware-request-${name}`)]));
}

test("a client-sent agreement header never reaches the page", async () => {
  // Without Supabase env the proxy skips the session work entirely, which is
  // exactly the path where nothing would set the header legitimately.
  const saved = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY };
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  try {
    const request = new NextRequest("http://localhost:3000/shifts", { headers: { [SESSION_HEADER]: encodeURIComponent(JSON.stringify({ id: "11111111-1111-1111-1111-111111111111", role: "ADMIN" })), "x-shiftsentry-path": "/evil" } });
    const forwarded = forwardedHeaders(await proxy(request));
    assert.equal(forwarded.has(SESSION_HEADER), false, "the forged agreement header was forwarded");
    assert.equal(forwarded.get("x-shiftsentry-path"), "/shifts", "the path header is the proxy's own");
    assert.ok(forwarded.get("x-nonce"), "the nonce is still forwarded");
  } finally {
    if (saved.url) process.env.NEXT_PUBLIC_SUPABASE_URL = saved.url;
    if (saved.key) process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = saved.key;
  }
});

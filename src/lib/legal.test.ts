import assert from "node:assert/strict";
import test from "node:test";
import { acceptancePath, hasRecentAuthentication, legalAcceptanceSchema, legalDestination, LEGAL_VERSION } from "./legal";
import { legalDocuments } from "./legal-documents";

test("acceptance requires the current version and both explicit confirmations", () => {
  assert.equal(legalAcceptanceSchema.safeParse({ version: LEGAL_VERSION, agreed: "on", eligible: "on" }).success, true);
  for (const change of [{ version: "forged" }, { agreed: undefined }, { eligible: undefined }, { agreed: true }]) {
    assert.equal(legalAcceptanceSchema.safeParse({ version: LEGAL_VERSION, agreed: "on", eligible: "on", ...change }).success, false);
  }
});

test("every published version stays readable, and the current one is the default", () => {
  assert.equal(legalDocuments()?.version, LEGAL_VERSION);
  assert.equal(legalDocuments("2026-10-11.1")?.version, "2026-10-11.1");
  assert.equal(legalDocuments("2099-01-01.1"), null);
  assert.match(legalDocuments("2026-10-11.1")!.privacy.sections.map((s) => s.paragraphs?.join(" ")).join(" "), /Amazon Web Services hosts the application/);
  assert.doesNotMatch(JSON.stringify(legalDocuments()), /Amazon Web Services/);
});

test("agreement redirects preserve deep links but refuse external URLs and loops", () => {
  assert.equal(acceptancePath("/game/ABC234?view=room"), "/accept-terms?next=%2Fgame%2FABC234%3Fview%3Droom");
  for (const path of ["//evil.example", "/.//evil.example", "/accept-terms?next=/login", "/login", "/auth/callback"]) assert.equal(legalDestination(path), "/");
});

test("deletion freshness uses authentication time rather than refreshed token time", () => {
  const now = 2_000_000_000_000;
  assert.equal(hasRecentAuthentication({ amr: [{ method: "oauth", timestamp: now / 1000 - 599 }] }, now), true);
  assert.equal(hasRecentAuthentication({ amr: [{ method: "password", timestamp: now / 1000 - 600 }] }, now), false);
  for (const amr of [undefined, ["password"], [{ method: "refresh_token", timestamp: now / 1000 }], [{ method: "password", timestamp: now / 1000 + 1 }], [{ method: "password", timestamp: NaN }]]) {
    assert.equal(hasRecentAuthentication({ amr }, now), false);
  }
});

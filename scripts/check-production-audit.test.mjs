import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const gate = fileURLToPath(new URL("./check-production-audit.mjs", import.meta.url));
const run = (report) => spawnSync(process.execPath, [gate], {
  input: typeof report === "string" ? report : JSON.stringify(report),
  encoding: "utf8",
});

test("allows a valid clean audit report", () => {
  assert.equal(run({ auditReportVersion: 2, vulnerabilities: {} }).status, 0);
});

test("blocks former Prisma exceptions even when npm offers only a breaking fix", () => {
  for (const name of ["prisma", "@prisma/config", "deepmerge-ts", "mysql2"]) {
    const result = run({ auditReportVersion: 2, vulnerabilities: {
      [name]: { severity: "high", via: [{ source: 1145093 }], fixAvailable: { isSemVerMajor: true } },
    } });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(name));
  }
});

test("blocks a critical vulnerability with no available fix", () => {
  assert.equal(run({ auditReportVersion: 2, vulnerabilities: {
    dependency: { severity: "critical", fixAvailable: false },
  } }).status, 1);
});

test("fails closed for registry errors and malformed reports", () => {
  for (const report of ["invalid JSON", "null", {},
    { auditReportVersion: 2, vulnerabilities: null },
    { auditReportVersion: 2, vulnerabilities: [] },
    { auditReportVersion: 2, vulnerabilities: {}, error: { code: "EAI_AGAIN" } },
    { auditReportVersion: 2, vulnerabilities: { dependency: null } },
  ]) assert.equal(run(report).status, 1);
});

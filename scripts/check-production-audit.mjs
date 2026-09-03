const highSeverity = new Set(["high", "critical"]);

// Advisories we have looked at and accepted, keyed by package. Each predicate
// pins the exact finding, so an unrelated future advisory in the same package
// still fails the gate rather than inheriting the exception. An entry is only
// honoured when npm also reports no fix, or a semver-major one -- see below.
//
// Everything here reaches production through one chain:
//
//   @prisma/client -> prisma -> { @prisma/config -> deepmerge-ts, mysql2 }
//
// Prisma 7's client pulls in the CLI, which bundles a driver for every database
// it supports. The only remediation npm offers is prisma 6.19.3, a downgrade
// across a major that would break @prisma/adapter-pg 7.x.
const baseline = {
  "@prisma/config": (vulnerability) =>
    vulnerability.via.length === 1 && vulnerability.via[0] === "deepmerge-ts",
  "deepmerge-ts": (vulnerability) =>
    vulnerability.via.length === 1 &&
    typeof vulnerability.via[0] === "object" &&
    vulnerability.via[0].source === 1145093,
  // mysql2 no longer needs an exception. prisma 7.9.1 pins it to exactly 3.15.3,
  // which carried GHSA-3f6p-5ww8-9rcr (auth-plugin downgrade leaking the
  // password in plaintext) and later GHSA-rgwj-5xj2-c3m3 (decompression-bomb
  // DoS). Because the pin is exact, npm could not move it and only offered a
  // semver-major prisma downgrade. A `mysql2` override in package.json raises
  // it to 3.24.3, which fixes both -- safe here because the app speaks Postgres
  // through @prisma/adapter-pg and pg and never opens a MySQL connection, so
  // the bundled driver is dead weight either way. Deliberately not baselined:
  // if that override is ever dropped, this gate must fail loudly again.
  // Flagged only as the parent of the two entries above. Listing the accepted
  // children rather than a fixed length means a third one appearing -- some new
  // bundled driver -- fails the gate instead of hiding behind this exception.
  prisma: (vulnerability) =>
    vulnerability.via.length > 0 &&
    vulnerability.via.every(
      (via) => via === "@prisma/config" || via === "mysql2",
    ),
};

let input = "";

for await (const chunk of process.stdin) {
  input += chunk;
}

let report;

try {
  report = JSON.parse(input);
} catch {
  console.error("npm audit did not return a valid JSON report.");
  process.exit(1);
}

if (report.auditReportVersion !== 2 || typeof report.vulnerabilities !== "object") {
  console.error("npm audit did not return a supported vulnerability report.");
  process.exit(1);
}

const failures = [];
const allowed = [];

for (const [name, vulnerability] of Object.entries(report.vulnerabilities)) {
  if (!highSeverity.has(vulnerability.severity)) {
    continue;
  }

  const matchesBaseline = baseline[name]?.(vulnerability) ?? false;
  const requiresBreakingFix =
    typeof vulnerability.fixAvailable === "object" &&
    vulnerability.fixAvailable.isSemVerMajor === true;

  if (matchesBaseline && (vulnerability.fixAvailable === false || requiresBreakingFix)) {
    allowed.push(name);
    continue;
  }

  failures.push(name);
}

if (failures.length > 0) {
  console.error(
    `Production audit found release-blocking high/critical vulnerabilities: ${failures.join(", ")}.`,
  );
  process.exit(1);
}

if (allowed.length > 0) {
  console.log(
    `Allowed tracked Prisma/deepmerge-ts baseline: ${allowed.join(", ")}. A compatible remediation will fail this check.`,
  );
} else {
  console.log("Production dependencies have no high or critical npm audit findings.");
}

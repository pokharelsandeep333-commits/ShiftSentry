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
  // GHSA-3f6p-5ww8-9rcr: mysql2 below 3.22.0 can be talked into downgrading to
  // the mysql_clear_password auth plugin, handing a malicious MySQL server the
  // password in plaintext. Unreachable here -- this app speaks Postgres through
  // @prisma/adapter-pg and pg, and never opens a MySQL connection. Drop this
  // entry once a prisma release pins mysql2 >= 3.22.0; as of prisma 7.10.0 the
  // newest 7.x still pins 3.15.3.
  mysql2: (vulnerability) =>
    vulnerability.via.length === 1 &&
    typeof vulnerability.via[0] === "object" &&
    vulnerability.via[0].source === 1153173,
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

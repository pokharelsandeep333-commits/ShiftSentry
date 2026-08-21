const highSeverity = new Set(["high", "critical"]);

const baseline = {
  "@prisma/config": (vulnerability) =>
    vulnerability.via.length === 1 && vulnerability.via[0] === "deepmerge-ts",
  "deepmerge-ts": (vulnerability) =>
    vulnerability.via.length === 1 &&
    typeof vulnerability.via[0] === "object" &&
    vulnerability.via[0].source === 1145093,
  prisma: (vulnerability) =>
    vulnerability.via.length === 1 && vulnerability.via[0] === "@prisma/config",
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

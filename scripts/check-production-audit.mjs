const highSeverity = new Set(["high", "critical"]);
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

if (
  !report || report.auditReportVersion !== 2 ||
  !report.vulnerabilities || typeof report.vulnerabilities !== "object" ||
  Array.isArray(report.vulnerabilities) || report.error
) {
  console.error("npm audit did not return a supported vulnerability report.");
  process.exit(1);
}

const failures = [];
for (const [name, vulnerability] of Object.entries(report.vulnerabilities)) {
  if (!vulnerability || typeof vulnerability.severity !== "string") {
    console.error("npm audit returned a malformed vulnerability entry.");
    process.exit(1);
  }
  if (highSeverity.has(vulnerability.severity)) failures.push(name);
}

if (failures.length > 0) {
  console.error(`Production audit found release-blocking high/critical vulnerabilities: ${failures.join(", ")}.`);
  process.exit(1);
}

console.log("Production dependencies have no high or critical npm audit findings.");

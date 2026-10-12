import pg from "pg";
import { readFileSync } from "node:fs";

if (!process.env.SUPABASE_DB_URL) throw new Error("The protected production database credential is required.");
// pg connection-string SSL flags can override an explicit ssl object. Remove
// them so the production connection always verifies the provider certificate.
let client;
try {
  // Parsing errors can include the full input URL, including its password.
  // Configuration and client construction belong inside the sanitized handler.
  const connection = new URL(process.env.SUPABASE_DB_URL);
  for (const key of [...connection.searchParams.keys()]) if (key.startsWith("ssl")) connection.searchParams.delete(key);
  const ca = readFileSync(new URL("./certs/supabase-prod-ca-2021.crt", import.meta.url), "utf8");
  client = new pg.Client({ connectionString: connection.toString(), ssl: { ca, rejectUnauthorized: true }, application_name: "shiftsentry-retention", connectionTimeoutMillis: 15_000 });
  await client.connect();
  await client.query("SET statement_timeout = '60s'");
  const { rows } = await client.query("SELECT public.purge_security_audit() AS removed");
  console.log(`Retention cleanup removed ${rows[0].removed} expired security audit entries.`);
} catch {
  // A driver's exception can contain connection details. Never log it.
  console.error("Retention cleanup failed. Check the protected credential and database availability.");
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
}

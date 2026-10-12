# Supabase database CA

`supabase-prod-ca-2021.crt` is the public CA certificate linked by the authenticated project's Database Settings / SSL configuration screen. Retrieved October 11, 2026 from:

https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

The retention PG client supplies this CA with `rejectUnauthorized: true`; hostname verification stays enabled. It does not change the OS/browser trust store or app credentials. [Supabase SSL guidance](https://supabase.com/docs/guides/platform/ssl-enforcement) requires this provider CA for strict verification.

Verified certificate: Supabase Root 2021 CA, expires April 26, 2031. DER SHA-256 fingerprint: `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`. Downloaded PEM file SHA-256: `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`. A read-only provider connection with this CA and hostname verification passed.

Before provider CA rotation or expiry, obtain the replacement through the official dashboard over HTTPS, review its issuer/validity/fingerprint, and verify a read-only `SELECT 1` with the existing protected connection. Never set `rejectUnauthorized: false` to hide a failed trust check. Do not run purge against production to test a certificate before the migration/deployment is authorized.

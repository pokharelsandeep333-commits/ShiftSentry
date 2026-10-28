# Account and privacy operations

Implementation prepared October 11, 2026 and released through PR #95; on October 12, 2026 `/api/health` reported a commit containing it and the daily retention workflow had completed successfully on `main`. The manual checks under **Release verification** below are not recorded here as done. Operator: Sandeep Pokharel, South Dakota, United States. Contact: contact@sandeeppokharel.com.np. No postal address is asserted.

## Account agreement and rights

`/accept-terms` and `/account` are outside the workspace layout. Email, Google, and GitHub login converge on the same versioned acceptance gate. Both confirmations start unchecked: Terms agreement/privacy-notice acknowledgment and 16+ eligibility with guardian permission below local adulthood. No birth date, identity document, or acceptance IP is collected. Privacy acknowledgment is not blanket consent to tracking or marketing.

SQL stores immutable document snapshots and account/version/server-time evidence. `accept_legal_terms` takes no user ID or timestamp. RLS exposes only the caller's history. Workspace server guards, normal table writes, and game RPCs independently require the latest agreement. A new material version needs a new JSON archive, a new migration with its exact document snapshot, an updated `LEGAL_VERSION`, and a retained lookup for every previous version. Never edit a published archive or applied migration. `npm run check:legal` pins this release's document/database match; extend that check for each future version.

Export, deletion, policy reading, and sign-out remain available without renewed agreement. `export_account_data()` uses one explicitly scoped JSON aggregate, avoiding PostgREST row limits. Credentials, encryption material, roles/words dealt in games, other players' contributions, and transient Google event payloads are excluded. Own final guesses and hosted room settings are included. The route requires a live Auth user and returns an attachment with private/no-store headers. Exports can be large; monitor response size and availability without logging payloads.

Deletion requires a live verified user, verified authentication-method timestamps within ten minutes, both destructive confirmations, and a server-only administrative client. The profile lock waits for admitted writes. Pending deletion denies later authenticated writes even while their JWT remains cryptographically valid. Global session revocation is required before Auth hard deletion. Google revocation is best effort: failure never preserves locally stored tokens or claims deletion failed after successful hard deletion. Hosted rooms are removed by cascade; non-host departures settle live game obligations before their contributions disappear. Shifts are deleted before jobs because the job FK is restrictive.

If preparation fails, no deletion starts. If revocation or Auth deletion fails, the account remains locked; never unlock automatically. The user can export and contact support, or retry with fresh authentication if sign-in is still available. Support uses the same lock/revoke/delete sequence after proportionate identity verification: in the admin area, open the account under Users and use Delete account (or Finish deletion for an account already locked). It requires typing the account's email and an admin sign-in within the last ten minutes, refuses admin accounts and your own, ends sessions with `admin_revoke_user_sessions`, and writes an `account.deleted_by_admin` audit row before it starts. Confirm deletion by checking Auth and the profile are absent, not by a UI redirect or an HTTP success alone. Do not copy credentials into a support ticket. Provider-side revocation failures can be resolved from the user's Google security controls.

### Ending a user's sessions

Users > account > Sign out everywhere calls `admin_revoke_user_sessions` (service role / owner only), which deletes the user's `auth.sessions` rows; their refresh tokens cascade. An access token already issued keeps working until it expires (up to an hour). When writes must stop immediately, disable the account instead: the restrictive `is_account_enabled()` policies refuse writes at once. Both actions are audited.

## Security audit retention

The new `data-retention.yml` workflow schedules cleanup daily at 06:17 UTC and permits manual runs only on protected `main`. It uses the existing production environment `SUPABASE_DB_URL`, never a new public key or a build argument. It shares the release concurrency group. The PG connection verifies TLS certificates against Supabase's public CA, has bounded connection/query timeouts, and logs only the count removed. The certificate is public trust material, not a credential; it is used only by this client. See `scripts/certs/README.md` for provenance/renewal. Configuration parsing errors are also sanitized so malformed URLs cannot print passwords. A failed run must be investigated; GitHub schedules may be delayed.

`purge_security_audit()` removes entries strictly older than thirty days; the exact thirty-day boundary survives until the next run. Account deletion nulls FK identifiers and removes potentially identifying JSON details; only the non-identifying `authBanApplied` boolean is retained. Acceptance history cascades with the account. Incident evidence under a specific legal hold is separate, restricted, and has a documented legal reason and expiry; do not use an incident as an excuse to keep ordinary audit records indefinitely.

After deployment, run the retention workflow once and verify success/count. Read `min(created_at)` and the count of records older than thirty days using an authorized server connection without printing event details. Record the job run URL and date in private operations notes. The function is not executable by anonymous or authenticated users.

## Privacy requests

1. Log the request privately: received date, requested right, jurisdiction if relevant, required deadline, and status. Acknowledge promptly; do not promise a single universal statutory deadline.
2. Prefer authenticated self-service or a reply from the account email. For an inaccessible account, use a proportionate verification method and escalate suspicious or conflicting requests. Do not routinely collect IDs, dates of birth, or unrelated personal details.
3. Locate only the verified account's data. Use the scoped export for access/portability; correct records through authorized tools. For deletion, explain hosted-room consequences and any specifically justified legal exception before action.
4. Record fulfillment and any provider follow-up without retaining the export. A support note on the account (admin area, Users) is a reasonable place for "request received/fulfilled on <date>", but remember notes are personal data about the account holder: they appear in that person's export (without the author), are deleted with the account, and should hold facts, never credentials or opinions. Send the response through the operator's actual working mail system; the published contact is receive-only forwarding and must never be used as a From identity.
5. Reassess applicable deadlines and exceptions for the person's jurisdiction. EU/UK targeting or behavioral monitoring needs a fresh territorial-scope assessment; website accessibility alone does not settle it.

## Incident response

The operator owns the response. Record discovery time, scope, systems, affected data, affected jurisdictions, decisions, and evidence chain of custody in a restricted incident file.

1. Contain the verified cause: restrict affected endpoints/accounts, revoke compromised sessions/keys, isolate affected services if necessary, and preserve relevant logs before expiry. Avoid destroying evidence or publishing private details.
2. Assess whether data was acquired or accessed, including email/password-account credentials, calendar tokens, work notes, and shared game records. Confirm provider notifications and involvement. Identify affected people from verified evidence rather than guessing from traffic counts.
3. Obtain jurisdiction-specific notification advice immediately. South Dakota requires qualifying resident notification within sixty days of discovery/notification, subject to its statutory exceptions; a breach exceeding 250 South Dakota residents must also be reported to the Attorney General. A no-likely-harm determination requires investigation, Attorney General notice, and written evidence retained at least three years. See [SDCL 22-40-19 through 26](https://sdlegislature.gov/Statutes/22-40). Other states can impose different definitions, recipients, and deadlines. If GDPR applies, assess Articles 33/34 (including the regulator's 72-hour rule and applicable exceptions) independently. Never treat sixty days as a waiting period.
4. Notify required parties with confirmed facts, practical protective steps, and a working contact. Authenticate communications and keep proof of delivery. Do not send notifications automatically from an unverified inference.
5. Fix and test the cause, restore access safely, reapply deletions to restored data, and monitor recurrence. Document lessons and release verification. Set a retention expiry for each evidence category.

## Provider verification register

Read-only review on October 11, 2026:

| Provider | Verified evidence | Remaining boundary |
| --- | --- | --- |
| Supabase | Signed-in project settings show Free plan, `us-east-2` / East US (Ohio). Scheduled-backup screen says Free does not include project backups; PITR is an unavailable Pro add-on. | This does not prove absence of all internal disaster-recovery copies or manually created dumps. Current API/database log access is documented as one day on Free, with degraded quotas potentially shortening access; log query availability is not proof of all provider-internal deletion. |
| AWS | EC2 API identifies the running SandeepCloud application host in `us-east-1`. SSM has no managed instance available for host inspection. | Live Docker/Nginx log rotation, EBS/manual snapshots, host backups, and their expiry need a direct authorized host/provider inventory. Do not publish an unverified retention number or change shared hosting as part of this branch. |
| Cloudflare | Live public HTML contains its beacon; dashboard analytics covers the parent domain. The owner explicitly instructed leaving Cloudflare unchanged. | Privacy/storage pages disclose cookie-free Web Analytics. CSP may block execution; script presence alone does not prove a successful beacon transmission. No analytics removal is claimed or required for this delivery. Provider internal log expiry is not asserted. |
| Google/GitHub | Optional authentication integrations; Google Calendar remains read-only and flag-gated. | Users may revoke provider access independently. Authentication emails are transactional; no promotional email workflow exists. |

Moved 2026-10-28: the application host is no longer AWS. It runs on a self-operated server behind a Cloudflare Tunnel, temporarily, until a new provider is chosen. The AWS row describes the setup reviewed above.

Agreement coverage evidence: [Supabase DPA](https://supabase.com/legal/customer-resources/data-processing-addendum) forms part of its service agreement; [AWS DPA](https://docs.aws.amazon.com/whitepapers/latest/navigating-gdpr-compliance/aws-data-processing-addendum-dpa.html) is incorporated into service terms; [Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/) and [incorporation guidance](https://www.cloudflare.com/trust-hub/us-privacy-compliance/) describe its coverage. Preserve the account's accepted terms/effective dates and provider contract records privately. These published incorporation statements are evidence of the mechanism, not a claim that a separately signed custom DPA was verified. No new contract was accepted during the review. Provider settings and agreements must be rechecked when plans, subprocessors, or regions change.

Sources: [Supabase log access](https://supabase.com/docs/guides/troubleshooting/check-usage-for-monthly-active-users-mau-MwZaBs), [log query quotas](https://supabase.com/docs/guides/platform/manage-your-usage/logs-query), [Cloudflare beacon data/storage](https://developers.cloudflare.com/speed/observatory/rum-beacon/), [EDPB territorial-scope guidance](https://www.edpb.europa.eu/sites/default/files/files/file1/edpb_guidelines_3_2018_territorial_scope_after_public_consultation_en_1.pdf).

## Backups and restored deletions

Do not promise a fixed backup expiry until the actual backups and provider copies are inventoried. Scheduled backups/PITR are unavailable on the current Supabase plan. Before creating an operator backup, register its location, encryption/access, creation date, and fixed expiry. Keep it out of the public repository and application logs.

To reconcile self-service deletions without retaining deleted-user identifiers: immediately before any restore, obtain the current live Auth/profile ID set into encrypted, restricted temporary storage. Restore into an isolated database with the web app closed. Treat the current set as authoritative and hard-delete restored accounts absent from that set, plus every verified support deletion request after the restore point. This removes records for deleted accounts without keeping a perpetual deletion ledger. Inspect the restore's Auth consistency and replay necessary migrations and audit cleanup before opening traffic. Destroy temporary ID sets after reconciliation.

If the live database is lost, there is no authoritative current ID set. Keep the restored service closed until deletions can be reconciled from verified requests/provider evidence. Do not silently resurrect accounts. Before enabling backups as a recovery guarantee, implement and verify a separate protected deletion reconciliation mechanism that survives loss of the database and expires with the longest backup containing those accounts. Its data collection/retention needs its own disclosure. This branch does not claim that unverified infrastructure already exists.

## Processing purposes and applicability

| Purpose | Minimal data | Proposed basis if GDPR applies |
| --- | --- | --- |
| Requested account/work service | Account, jobs, rates, shifts, notes, settings | Performance of the requested service/contract; assess minor-contract rules separately. |
| Optional calendar connection | Scoped encrypted tokens, chosen calendars, sync identifiers/times | Requested integration; provider authorization is not blanket consent for another purpose. |
| Security and support | Limited audit events and request/support evidence | Documented legitimate interests with necessity/balancing assessment; legal obligations when specifically applicable. |
| Agreement evidence | Account, immutable version, server timestamp | Contract administration and proportionate evidence; no acceptance IP/identity collection. |
| Cloudflare performance analytics | Beacon page/referrer/performance metrics | Reassess territorial scope and any applicable lawful basis or terminal-access rules; cookie-free is not a universal legal exemption. |

The operator confirmed a small free US-focused app without sale of data. This is a factual scope assessment, not a compliance certification or permanent exemption from state/foreign laws. Review when targeting, user population, sensitive data, promotions, or payment features change.

## Release verification

This branch adds one migration and a daily workflow; applying it manually to production is unnecessary. Review and merge separately through the existing protected release. After authorized deployment verify `/api/health` commit, public `/privacy`, `/terms`, `/cookies`, invalid-route recovery, all three sign-in methods with a disposable account, existing-user/new-version acceptance, safe deep links, large exports, fresh/stale deletion, hosted game consequences, and a manual retention run. Delete only designated disposable accounts. Keep Cloudflare unchanged. Preserve EC2 Compose/Nginx paths, proxy headers, and secret placement.

The migration enforces the agreement before image promotion. Existing app clients can receive write errors during the interval until Watchtower runs the new image and users accept. Announce/coordinate that short transition and verify the running health commit; rolling back only the app image does not undo SQL guards. Never remove agreement evidence or edit an applied migration to work around a failed release.

# Screenshot checklist audit

October 11, 2026. Screenshots are reference checklists, not binding instructions or proof that every item is legally required. S1 = IMG_0607, S2 = IMG_0608, S3 = IMG_0609. The third screenshot says twenty items but visibly lists nineteen. Duplicate items appear here once.

| Visible item | Screenshots | Assessment and evidence |
| --- | --- | --- |
| Privacy policy / third-party disclosure | S1, S2, S3 | Updated `/privacy`: operator, purposes, providers, collection, controls, retention; immutable version JSON. |
| Terms / explicit form agreement | S1, S2, S3 | Updated `/terms`, two unchecked required confirmations on `/accept-terms`, server/RPC/table gates, immutable own history. |
| GDPR applicability | S1 | Conditional territorial assessment and processing-purpose register in `privacy-operations.md`; no universal compliance claim. |
| Lawful processing basis | S1 | Purpose-by-purpose register; requested service, security, applicable legal duties, separate optional integration/analytics assessment. |
| Cookie policy | S2 | `/cookies` inventories SDK auth/PKCE, return/state cookies, preferences, static-only offline storage. |
| Cookie banner / required consent | S1, S2, S3 | No optional cookie-based advertising/analytics introduced. Cloudflare's cookie-free beacon remains by owner instruction and is disclosed. No blanket Terms-as-tracking-consent or decorative nonfunctional banner. Reassess if storage/targeting changes. |
| Marketing consent / email unsubscribe | S1, S2 | No promotional emails. Auth messages stay separate. Introduce separate optional consent/unsubscribe only alongside future promotions; [FTC guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business?view=Schedule). |
| Data deletion | S1, S2 | `/account`, recent verified authentication, destructive confirmation, locking, session revocation, best-effort Google revocation, hard Auth deletion and cascades; SQL 23/24 and deletion unit tests. |
| Data retention | S1 | Account-linked agreement history cascades; audit identifiers redacted; daily protected 30-day cleanup. Provider copies and legal holds have separate documented boundaries. |
| Provider DPAs | S1 | Primary-source incorporation evidence and account-specific verification boundaries recorded in operations register. No unverified separate signature claim. |
| Data minimization | S2 | No DOB, ID documents, acceptance IP, event-content storage, or new marketing records. Export explicitly excludes credentials/other-user/hidden-game data. |
| SDK audit | S2 | Production audit gate passes; server-only administrative usage; credentials excluded from exports; build-generated dependency inventory. |
| Data security | S1 | Existing origin validation, Zod, RLS, dual business rules, CSP, encrypted tokens preserved; legal/delete SQL guards and no-store export added. |
| Breach procedure | S1 | Containment, evidence, jurisdiction/notification assessment, recovery, legal exceptions, and expiry documented in operations procedure. |
| Intellectual property | S1 | User-content ownership stated. Existing provenance retained; asset/license inventory below. No unsupported ownership certification. |
| Open-source licenses | S1 | Build-generated `/third-party-notices.txt` and `/dependency-license-inventory.json`; package licenses/notices/native source pointers included; own repo license unchanged. |
| Licensed fonts/images | S2 | Local Fontsource Inter/Outfit licenses retained in notices; generated-art/demo-capture provenance in `public/welcome/*.webp.json`. |
| Payments/subscriptions/refunds | S1, S2 | Free service with no payment collection, renewals, cancellation fees, or refund workflow. Terms explicitly say so. |
| Dark patterns / hidden fees | S2 | Unchecked confirmations, separate eligibility, accessible export/deletion before renewed agreement, clear hosted-room deletion consequence; no fees or upsells. |
| Fake reviews / unsupported claims | S2 | No testimonials found in landing content. Replaced “net pay, not a guess” with take-home-estimate wording; existing example rules stay backed by tests. |
| Accessibility / contrast / keyboard | S2 | Existing premium controls preserved, visible focus/legal targets, login live feedback, form alerts/busy states, dark preview image alternatives; responsive visual checks recorded with screenshots. This is scoped verification, not a WCAG certification. |
| Image alternative text | S2, S3 | Dark dashboard screenshot has meaningful alt; decorative art has empty alt. Hidden theme variant remains CSS-hidden to assistive technology. |
| Business/contact details | S2, S3 | Real named operator/state and working contact reused; no fabricated postal address. |
| Age consent | S2 | 16+ throughout new agreement; guardian permission below local adulthood; explicit eligibility attestation without identity collection. |
| Custom 404 | S3 | Branded `not-found.tsx` with home/sign-in links and noindex. |
| CTA above fold | S3 | Existing primary signup/navigation CTA retained; visual review at narrow widths. |
| Per-page titles | S3 | Public/legal and workspace titles updated; private screens remain noindex. |
| Per-page descriptions | S3 | Login/privacy/terms/cookies have their own descriptions and social metadata. |
| Open Graph image | S3 | Existing generated `/opengraph-image` and Twitter image retained. |
| Favicon set | S3 | Existing icon/apple/maskable routes and manifest retained. |
| robots.txt | S3 | Existing crawler access with private-route noindex preserved; robots is not access control. |
| sitemap.xml | S3 | Existing canonical sitemap updated with `/cookies`; private account routes excluded. |
| Mobile breakpoints | S3 | Existing responsive system preserved; new account/agreement pages measured at narrow widths, no horizontal overflow. |
| Sticky mobile CTA | S3 | Existing fixed signup navigation satisfies current landing intent; no duplicate sticky bar. |
| Loading states | S3 | Existing skeletons retained; agreement/deletion pending labels, disabled submissions, aria-busy added. |
| Form errors | S3 | Zod/server errors announced; HTML required/pattern constraints; generic recovery boundaries hide internal errors. |
| Thank-you page / success state | S3 | Existing signup email-confirmation feedback preserved; deletion redirects to `/account-deleted` only after successful hard deletion. |
| Analytics installed | S3 | Cloudflare beacon remains unchanged by explicit owner correction. It is disclosed, not newly installed or disabled. |

## Asset and license inventory

`npm run licenses:generate` inventories the production lockfile and copies installed licenses/notices into public build outputs. `prebuild` runs it in the actual Windows/Linux platform build so optional native package notices match the artifact. Docker copies those public outputs into its runner. They are generated and gitignored, not stale checked-in dependency copies. Upstream native dependency notices and LGPL/GPL texts are additionally preserved under `docs/licenses` and included in every generated artifact; provenance pins the upstream notice revision.

| Asset | Origin / evidence | License handling |
| --- | --- | --- |
| Inter variable | `@fontsource-variable/inter`, local CSS/fonts | Installed package OFL/license copied into third-party notices. |
| Outfit variable | `@fontsource-variable/outfit`, local CSS/fonts | Installed package OFL/license copied into third-party notices. |
| Lucide icons | Installed `lucide-react` | Installed ISC license retained in notices. |
| Hero/CTA glass artwork | `scripts/welcome-3d/scene.html`, renderer, adjacent provenance JSON | Locally rendered project scene; Three.js build-time source/license separately documented; no stock-photo claim. |
| Dashboard captures | Adjacent welcome provenance JSON, demo dashboard | Synthetic demo records; no user data. Recapture through renderer rather than editing WebP by hand. |
| Brand/calendar mark and social/favicons | Existing project source-generated SVG/image routes | Project-created code assets; preserve repository's existing licensing position. |
| Sharp and native libvips | Transitive Next image tooling; installed package versions and lockfile | Sharp Apache notices, native dependency license inventories, libvips LGPL and corresponding upstream source/build pointers. Preserve dynamic/native library replacement rights when distributing modified packages; review additional obligations before modifying those libraries. |
| Other production dependencies | Generated JSON lists each name/version/license/source/platform presence | Installed LICENSE/COPYING/NOTICE files retained. Generated inventory flags unknown licenses for review. |

Three.js is used only to render artwork and is not a production browser import. Source: [Three.js license](https://github.com/mrdoob/three.js/blob/r170/LICENSE). Native dependency details: [sharp-libvips notices](https://github.com/lovell/sharp-libvips/blob/main/THIRD-PARTY-NOTICES.md). The generator preserves notices shipped by each installed package; an upstream library's license remains applicable even when a wrapper uses another license. No third-party license can automatically establish ownership of the repository's own code.

## Verification limits

Disposable Docker SQL fixtures verify actual triggers/grants/RLS, over-1,000-row exports, deletion cascades, renewed versions, and concurrent-write locking. Unit tests verify freshness, safe returns, validation, and provider failure sequencing. Visual screenshots use credential-free preview mode, with destructive controls disabled. Complete live Google/GitHub/email round trips, current project token AMR behavior, provider revocation, post-deploy health, and scheduled cleanup execution are release verification, not asserted by static or preview tests. Operational facts not accessible in this review remain explicitly marked in the provider register.

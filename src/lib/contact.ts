/**
 * The one public contact address, used by the legal pages, the landing footer
 * and /account-disabled. It is receive-only forwarding: never use it as the
 * From of mail the app or Supabase sends, or DMARC will reject that mail.
 *
 * It lives here rather than in `legal-page.tsx` because the legal shell
 * renders the landing footer, which needs it too: importing it from the shell
 * would be a circular import, and the footer reads it while its module loads.
 */
export const LEGAL_CONTACT_EMAIL = "contact@sandeeppokharel.com.np";

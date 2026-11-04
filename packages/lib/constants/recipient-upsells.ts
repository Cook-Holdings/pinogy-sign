import { env } from '../utils/env';

/**
 * Pinogy fork: whether recipient-facing Documenso promotions are shown.
 *
 * Covers the "Need to sign documents? … Claim account" sign-up panel and the
 * "Share your signing experience" (tweet @documenso) button on
 * `/sign/:token/complete`.
 *
 * Every recipient on this deployment is a Pinogy customer signing through an
 * integration (the in-store adoption tablet via token-exchange, Mr. Groomly),
 * often on a shared store kiosk. Offering them a Documenso account prefilled
 * with their email, or a Documenso social share, is wrong for that audience,
 * so the promotions are OFF unless explicitly enabled — the inverse of
 * upstream, where they are always on.
 *
 * Server-only: read it in a loader, never in a component.
 */
export const isRecipientUpsellEnabled = (): boolean => env('NEXT_PRIVATE_ENABLE_RECIPIENT_UPSELLS') === 'true';

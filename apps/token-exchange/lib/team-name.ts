/**
 * Team display-name handling for POST /api/exchange (and /api/exchange/trusted).
 *
 * The team's *name* is what a signer reads ("<team> on behalf of "<team>" has invited you
 * to sign…" on the signing page and in the invite email). Callers used to send only a
 * machine slug (ssdriver: `pinogy-client-{client_id}`), and the team was created with that
 * slug as its name, so consumers saw "pinogy-client-107". The optional `teamName` field lets
 * the caller supply the consumer-facing name instead.
 *
 * Kept free of prisma / @documenso/lib imports so it can be unit-tested in isolation
 * (`npm run test -w @documenso/token-exchange`).
 */

/**
 * Mirrors ZTeamNameSchema (packages/trpc/server/team-router/schema.ts): 3-30 characters after
 * trimming, and no URLs. A name outside those bounds would be rejected the next time a human
 * saves the team settings form, so it must never be written here.
 */
export const TEAM_NAME_MIN_LENGTH = 3;
export const TEAM_NAME_MAX_LENGTH = 30;

// Same pattern as URL_PATTERN in packages/lib/constants/auth.ts.
const URL_PATTERN = /https?:\/\/|www\./i;

/**
 * Normalise a caller-supplied team display name.
 *
 * Returns `null` when no usable name was supplied, in which case the caller must behave exactly
 * as before the field existed (team named after the slug, existing team untouched). Deliberately
 * lenient rather than a 400: `teamName` is cosmetic, and failing the exchange over it would cost
 * the store its e-sign for the whole session. Over-long names are truncated rather than dropped,
 * because a truncated store name is still far better for the signer than the slug.
 */
export function normaliseTeamName(raw: unknown): string | null {
  if (typeof raw !== 'string') {
    return null;
  }

  const collapsed = raw.replace(/\s+/g, ' ').trim();
  const truncated = collapsed.slice(0, TEAM_NAME_MAX_LENGTH).trim();

  if (truncated.length < TEAM_NAME_MIN_LENGTH) {
    return null;
  }

  if (URL_PATTERN.test(truncated)) {
    return null;
  }

  return truncated;
}

/**
 * Decide whether an EXISTING team's name should be replaced by the requested display name.
 *
 * Only a team whose name is still the machine default — the slug it was created with, or the
 * derived team URL — is renamed. Anything else means a human renamed it in the Documenso UI, and
 * an automated exchange must never overwrite that.
 *
 * Returns the new name to write, or `null` to leave the team alone.
 */
export function teamNameToApply({
  currentName,
  slug,
  teamUrl,
  requestedName,
}: {
  currentName: string;
  slug: string;
  teamUrl: string;
  requestedName: string | null;
}): string | null {
  if (!requestedName) {
    return null;
  }

  if (currentName === requestedName) {
    return null;
  }

  const isMachineDefault = currentName === slug || currentName === teamUrl;

  if (!isMachineDefault) {
    return null;
  }

  return requestedName;
}

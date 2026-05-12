import { z } from 'zod';

/**
 * Shared organisation name validation.
 * Kept in a leaf module (no Prisma imports) so modules such as `subscription.ts`
 * can use it without creating a circular import with generated
 * `OrganisationClaimSchema` (which imports `ZClaimFlagsSchema` from subscription).
 */
export const ZOrganisationNameSchema = z
  .string()
  .min(3, { message: 'Minimum 3 characters' })
  .max(50, { message: 'Maximum 50 characters' });

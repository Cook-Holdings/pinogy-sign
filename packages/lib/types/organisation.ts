import { z } from 'zod';

/**
 * Shared organisation name validation schema.
 * Used by subscription metadata, create-organisation, and admin organisation routes.
 */
export const ZOrganisationNameSchema = z
  .string()
  .min(3, { message: 'Minimum 3 characters' })
  .max(50, { message: 'Maximum 50 characters' });

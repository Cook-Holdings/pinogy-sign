import { createApiToken } from '@documenso/lib/server-only/public-api/create-api-token';
import { createTeam } from '@documenso/lib/server-only/team/create-team';
import { prisma } from '@documenso/prisma';
import slugify from '@sindresorhus/slugify';

import { teamNameToApply } from './team-name';
import { validateThirdPartyCredentials } from './validate-credentials';

export type ExchangeInput = {
  credentials: Record<string, unknown>;
  slug: string;
  organisationId: string;
  /**
   * Optional consumer-facing team display name (already normalised with `normaliseTeamName`).
   * `null`/absent keeps the pre-existing behaviour: the team is named after the slug.
   */
  teamName?: string | null;
};

export type ExchangeResult =
  | { success: true; teamId: number; apiKey: string; teamCreated: boolean }
  | { success: false; error: string; code: string };

export async function exchangeCredentials({
  credentials,
  slug,
  organisationId,
  teamName,
}: ExchangeInput): Promise<ExchangeResult> {
  const isValid = await validateThirdPartyCredentials(credentials);

  if (!isValid) {
    return {
      success: false,
      error: 'Invalid credentials',
      code: 'INVALID_CREDENTIALS',
    };
  }

  const teamUrl = slugify(slug, { lowercase: true });

  if (!teamUrl) {
    return {
      success: false,
      error: 'Invalid slug',
      code: 'INVALID_SLUG',
    };
  }

  const organisation = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { id: true, ownerUserId: true },
  });

  if (!organisation) {
    return {
      success: false,
      error: 'Organisation not found',
      code: 'ORGANISATION_NOT_FOUND',
    };
  }

  let team = await prisma.team.findFirst({
    where: {
      url: teamUrl,
      organisationId,
    },
  });

  let teamCreated = false;

  if (!team) {
    try {
      await createTeam({
        userId: organisation.ownerUserId,
        teamName: teamName || slug,
        teamUrl,
        organisationId,
        inheritMembers: true,
      });
    } catch (err) {
      // Prisma unique constraint violation
      const hasP2002 =
        err &&
        typeof err === 'object' &&
        'code' in err &&
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        (err as { code?: unknown }).code === 'P2002';

      if (hasP2002) {
        return {
          success: false,
          error: 'Team URL already exists in another organisation',
          code: 'TEAM_URL_TAKEN',
        };
      }

      throw err;
    }

    team = await prisma.team.findFirst({
      where: {
        url: teamUrl,
        organisationId,
      },
    });

    if (!team) {
      return {
        success: false,
        error: 'Failed to create team',
        code: 'TEAM_CREATION_FAILED',
      };
    }

    teamCreated = true;
  } else {
    team = await syncTeamDisplayName({ team, slug, teamUrl, teamName });
  }

  const tokenName = `Token Exchange - ${new Date().toISOString().slice(0, 10)}`;

  const { token } = await createApiToken({
    userId: organisation.ownerUserId,
    teamId: team.id,
    tokenName,
    expiresIn: null,
  });

  return {
    success: true,
    teamId: team.id,
    apiKey: token,
    teamCreated,
  };
}

/**
 * Trusted exchange: no credential validation. Caller is authenticated by TOKEN_EXCHANGE_SECRET.
 * Used when the token-exchange is the sole gatekeeper (e.g. Groom app).
 */
export async function exchangeTrusted({
  slug,
  organisationId,
  teamName,
}: {
  slug: string;
  organisationId: string;
  teamName?: string | null;
}): Promise<ExchangeResult> {
  const teamUrl = slugify(slug, { lowercase: true });

  if (!teamUrl) {
    return {
      success: false,
      error: 'Invalid slug',
      code: 'INVALID_SLUG',
    };
  }

  const organisation = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { id: true, ownerUserId: true },
  });

  if (!organisation) {
    return {
      success: false,
      error: 'Organisation not found',
      code: 'ORGANISATION_NOT_FOUND',
    };
  }

  let team = await prisma.team.findFirst({
    where: {
      url: teamUrl,
      organisationId,
    },
  });

  let teamCreated = false;

  if (!team) {
    try {
      await createTeam({
        userId: organisation.ownerUserId,
        teamName: teamName || slug,
        teamUrl,
        organisationId,
        inheritMembers: true,
      });
    } catch (err) {
      const hasP2002 = err && typeof err === 'object' && 'code' in err && (err as { code?: unknown }).code === 'P2002';

      if (hasP2002) {
        return {
          success: false,
          error: 'Team URL already exists in another organisation',
          code: 'TEAM_URL_TAKEN',
        };
      }

      throw err;
    }

    team = await prisma.team.findFirst({
      where: {
        url: teamUrl,
        organisationId,
      },
    });

    if (!team) {
      return {
        success: false,
        error: 'Failed to create team',
        code: 'TEAM_CREATION_FAILED',
      };
    }

    teamCreated = true;
  } else {
    team = await syncTeamDisplayName({ team, slug, teamUrl, teamName });
  }

  const tokenName = `Token Exchange - ${new Date().toISOString().slice(0, 10)}`;

  const { token } = await createApiToken({
    userId: organisation.ownerUserId,
    teamId: team.id,
    tokenName,
    expiresIn: null,
  });

  return {
    success: true,
    teamId: team.id,
    apiKey: token,
    teamCreated,
  };
}

/**
 * Give an existing team the caller's display name, but only while it still carries the
 * machine default (the slug). Teams created before `teamName` existed are named
 * `pinogy-client-{id}`; this renames them on their next exchange. A name a human set in the
 * Documenso UI is never overwritten — see `teamNameToApply`.
 *
 * Written with prisma directly rather than `updateTeam`: that helper looks up
 * `{ url: data.url, id: { not: teamId } }`, and with `url` undefined the lookup matches any
 * other team, so a name-only update always throws "Team URL already exists".
 *
 * A failed rename is logged and swallowed: the name is cosmetic, and the exchange's job is the
 * API key.
 */
async function syncTeamDisplayName<T extends { id: number; name: string }>({
  team,
  slug,
  teamUrl,
  teamName,
}: {
  team: T;
  slug: string;
  teamUrl: string;
  teamName?: string | null;
}): Promise<T> {
  const newName = teamNameToApply({
    currentName: team.name,
    slug,
    teamUrl,
    requestedName: teamName ?? null,
  });

  if (!newName) {
    return team;
  }

  try {
    await prisma.team.update({
      where: { id: team.id },
      data: { name: newName },
    });

    return { ...team, name: newName };
  } catch (err) {
    console.error(`[token-exchange] failed to rename team ${team.id} to its display name`, err);

    return team;
  }
}

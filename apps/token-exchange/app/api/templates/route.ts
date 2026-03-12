import type { NextRequest } from 'next/server';

import cors from '@/lib/cors';
import { getTemplates } from '@/lib/documenso-client';

function getAuthHeader(req: NextRequest): string | null {
  const auth = req.headers.get('Authorization');
  if (auth?.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  return req.headers.get('X-API-Key');
}

function getApiKey(req: NextRequest): string | null {
  const key = req.headers.get('X-Documenso-API-Key');
  if (key) return key;
  const url = new URL(req.url);
  return url.searchParams.get('apiKey');
}

/**
 * GET /api/templates
 *
 * List templates for the team. Auth: Bearer TOKEN_EXCHANGE_SECRET.
 * Documenso API key: X-Documenso-API-Key header or apiKey query param (required).
 * Query: page?, perPage?
 */
export async function GET(request: NextRequest) {
  const secret = process.env.TOKEN_EXCHANGE_SECRET;

  if (!secret) {
    return cors(
      request,
      new Response(
        JSON.stringify({ error: 'Token exchange is not configured', code: 'CONFIG_ERROR' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  }

  const provided = getAuthHeader(request);
  if (!provided || provided !== secret) {
    return cors(
      request,
      new Response(JSON.stringify({ error: 'Unauthorized', code: 'UNAUTHORIZED' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }

  const apiKey = getApiKey(request);
  if (!apiKey?.trim()) {
    return cors(
      request,
      new Response(
        JSON.stringify({
          error: 'Missing X-Documenso-API-Key or apiKey query param',
          code: 'INVALID_REQUEST',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  }

  const url = new URL(request.url);
  const page = url.searchParams.get('page');
  const perPage = url.searchParams.get('perPage');

  try {
    const result = await getTemplates(apiKey.trim(), {
      page: page ? Number(page) : undefined,
      perPage: perPage ? Number(perPage) : undefined,
    });
    return cors(
      request,
      new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return cors(
      request,
      new Response(
        JSON.stringify({
          error: message,
          code: 'DOCUMENSO_API_ERROR',
        }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  }
}

export function OPTIONS(request: NextRequest) {
  return cors(request, new Response(null, { status: 204 }));
}

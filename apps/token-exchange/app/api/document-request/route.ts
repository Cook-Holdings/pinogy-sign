import type { NextRequest } from 'next/server';

import cors from '@/lib/cors';
import { buildTemplateAuthoringLink, createPresignToken } from '@/lib/documenso-client';

function getAuthHeader(req: NextRequest): string | null {
  const auth = req.headers.get('Authorization');
  if (auth?.startsWith('Bearer ')) {
    return auth.slice(7);
  }
  return req.headers.get('X-API-Key');
}

const DEFAULT_EXPIRES_IN_MINUTES = 60;
const MAX_EXPIRES_IN_MINUTES = 10080;

/**
 * POST /api/document-request
 *
 * Returns an embed authoring link so the recipient can upload a document and create a template.
 * Auth: Bearer TOKEN_EXCHANGE_SECRET.
 * Body: { recipientEmail: string, apiKey: string, expiresIn?: number } (expiresIn in minutes, default 60).
 * Returns: { link, expiresAt, expiresIn, recipientEmail } — open or share link for recipient to create a template.
 */
export async function POST(request: NextRequest) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return cors(
      request,
      new Response(JSON.stringify({ error: 'Invalid JSON body', code: 'INVALID_JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }

  const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);
  const data = isRecord(body) ? body : {};
  const recipientEmail = typeof data.recipientEmail === 'string' ? data.recipientEmail : '';
  const apiKey = typeof data.apiKey === 'string' ? data.apiKey : '';

  if (!recipientEmail.trim()) {
    return cors(
      request,
      new Response(
        JSON.stringify({ error: 'Missing or invalid recipientEmail', code: 'INVALID_REQUEST' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  }

  if (!apiKey.trim()) {
    return cors(
      request,
      new Response(
        JSON.stringify({ error: 'Missing or invalid apiKey', code: 'INVALID_REQUEST' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  }

  const expiresInMinutes = (() => {
    const raw = data.expiresIn;
    if (raw == null) return DEFAULT_EXPIRES_IN_MINUTES;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) return DEFAULT_EXPIRES_IN_MINUTES;
    return Math.min(n, MAX_EXPIRES_IN_MINUTES);
  })();

  try {
    const presign = await createPresignToken(apiKey.trim(), {
      expiresIn: expiresInMinutes * 60,
    });
    const link = buildTemplateAuthoringLink(presign.token);

    return cors(
      request,
      new Response(
        JSON.stringify({
          link,
          expiresAt: presign.expiresAt,
          expiresIn: presign.expiresIn,
          recipientEmail: recipientEmail.trim(),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
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

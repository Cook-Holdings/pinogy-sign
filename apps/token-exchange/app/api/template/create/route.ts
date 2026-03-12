import type { NextRequest } from 'next/server';

import cors from '@/lib/cors';
import {
  buildTemplateEditAuthoringLink,
  createPresignToken,
  createTemplate,
} from '@/lib/documenso-client';

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

const MAX_EXPIRES_IN_MINUTES = 10080; // 7 days
const DEFAULT_EXPIRES_IN_MINUTES = 60;

/**
 * POST /api/template/create
 *
 * Upload a PDF as a template. Auth: Bearer TOKEN_EXCHANGE_SECRET.
 * Documenso API key: X-Documenso-API-Key header or apiKey query (required).
 * Body (FormData): file (required), name? (template title), expiresIn? (authoring link expiry in minutes, default 60, max 10080).
 * Returns: { id, authoringLink, expiresAt, expiresIn } — use id for create-envelope; open authoringLink to add recipients/fields.
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

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return cors(
      request,
      new Response(JSON.stringify({ error: 'Invalid form data', code: 'INVALID_BODY' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return cors(
      request,
      new Response(JSON.stringify({ error: 'Missing or invalid file', code: 'INVALID_REQUEST' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  }

  const nameRaw = formData.get('name');
  const name =
    typeof nameRaw === 'string' && nameRaw.trim()
      ? nameRaw.trim()
      : file.name.replace(/\.pdf$/i, '') || 'Untitled';
  const expiresInMinutes = (() => {
    const raw = formData.get('expiresIn');
    if (raw == null || raw === '') return DEFAULT_EXPIRES_IN_MINUTES;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 1) return DEFAULT_EXPIRES_IN_MINUTES;
    return Math.min(n, MAX_EXPIRES_IN_MINUTES);
  })();

  const payload = JSON.stringify({ title: name });
  const documensoFormData = new FormData();
  documensoFormData.append('payload', payload);
  documensoFormData.append('file', file, file.name);

  try {
    const { id } = await createTemplate(apiKey.trim(), documensoFormData);
    const presign = await createPresignToken(apiKey.trim(), {
      expiresIn: expiresInMinutes * 60,
    });
    const authoringLink = buildTemplateEditAuthoringLink(id, presign.token);

    return cors(
      request,
      new Response(
        JSON.stringify({
          id,
          authoringLink,
          expiresAt: presign.expiresAt,
          expiresIn: presign.expiresIn,
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

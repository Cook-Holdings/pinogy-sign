import type { NextRequest } from 'next/server';

import cors from '@/lib/cors';
import {
  createEnvelope,
  createTemplateFields,
  createTemplateRecipients,
  getTemplate,
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

/** Default placeholders to add when configuring a template so it's ready to sign. */
const DEFAULT_PLACEHOLDER_FIELDS = [
  { placeholder: '{{signature, r1}}', type: 'SIGNATURE' },
] as const;

/**
 * POST /api/document/create-from-template
 *
 * "Authoring logic": ensure the template has a signer and placeholder-based fields, then create
 * an envelope from it. Use when the template PDF has {{signature, r1}} (and optionally
 * {{date, r1}}, {{initials, r1}} or {{initial, r1}}, {{name, r1}}) but the template was never opened in the authoring UI.
 *
 * Auth: Bearer TOKEN_EXCHANGE_SECRET. X-Documenso-API-Key or apiKey query (required).
 * Body (JSON): templateId (number), recipientEmail (string), recipientName?, title?, placeholders?
 *   placeholders: optional array of { placeholder: string, type: string, matchAll?: boolean }. Types: SIGNATURE, DATE, INITIALS, NAME, etc.
 *   matchAll: when true (default), creates a field at every occurrence of the placeholder in the PDF (e.g. 4 signature fields on 4 pages).
 *   Defaults to [{{signature, r1}}]. When you omit `placeholders`, best-effort passes add
 *   {{initials, r1}} and, for each extra SIGNER on the template (r2, r3, …), {{signature, rN}}
 *   and {{initials, rN}} with matchAll — each skipped if that token is not in the PDF.
 *   Pass `placeholders` explicitly when you need full control (or omit r2 defaults on purpose).
 *   Add {{date, r1}}, {{name, r1}}, etc. in `placeholders` when needed.
 *
 * Success: { envelopeId, signingUrl, signingToken }
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
  const templateId =
    typeof data.templateId === 'number' ? data.templateId : Number(data.templateId);
  const recipientEmail =
    typeof data.recipientEmail === 'string' && data.recipientEmail.trim()
      ? data.recipientEmail.trim()
      : '';
  const recipientName =
    typeof data.recipientName === 'string' && data.recipientName.trim()
      ? data.recipientName.trim()
      : 'Signer';
  const title = typeof data.title === 'string' && data.title.trim() ? data.title.trim() : undefined;
  const placeholdersRaw = data.placeholders;

  if (!Number.isInteger(templateId) || templateId < 1) {
    return cors(
      request,
      new Response(
        JSON.stringify({ error: 'Missing or invalid templateId', code: 'INVALID_REQUEST' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  }

  if (!recipientEmail) {
    return cors(
      request,
      new Response(
        JSON.stringify({ error: 'Missing or invalid recipientEmail', code: 'INVALID_REQUEST' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  }

  type PlaceholderEntry = { placeholder: string; type: string; matchAll?: boolean };

  const usedBuiltInDefaultPlaceholders =
    !Array.isArray(placeholdersRaw) || placeholdersRaw.length === 0;

  const placeholders: PlaceholderEntry[] = (() => {
    if (Array.isArray(placeholdersRaw) && placeholdersRaw.length > 0) {
      return placeholdersRaw
        .filter(
          (p): p is Record<string, unknown> =>
            isRecord(p) && typeof p.placeholder === 'string' && typeof p.type === 'string',
        )
        .map((p) => ({
          placeholder: String(p.placeholder).trim(),
          type: String(p.type).trim(),
          ...(typeof p.matchAll === 'boolean' ? { matchAll: p.matchAll } : {}),
        }))
        .filter((p) => p.placeholder.length > 0 && p.type.length > 0);
    }
    return DEFAULT_PLACEHOLDER_FIELDS.map((p) => ({
      placeholder: p.placeholder,
      type: p.type,
    }));
  })();

  try {
    let template = await getTemplate(apiKey.trim(), templateId);
    let recipients = template.recipients ?? [];
    const existingSigner = recipients.find((r) => String(r.role).toUpperCase() === 'SIGNER');

    let signerId: number;

    if (existingSigner?.id) {
      signerId = existingSigner.id;
    } else {
      const created = await createTemplateRecipients(apiKey.trim(), templateId, [
        { email: 'recipient.1@documenso.com', name: 'Signer', role: 'SIGNER' },
      ]);
      const first = created.recipients[0];
      if (!first?.id) {
        throw new Error('Failed to create template signer');
      }
      signerId = first.id;
      template = await getTemplate(apiKey.trim(), templateId);
      recipients = template.recipients ?? [];
    }

    const templateSignersOrdered = [...recipients]
      .filter((r) => String(r.role).toUpperCase() === 'SIGNER')
      .sort((a, b) => {
        const ao = typeof a.signingOrder === 'number' ? a.signingOrder : 0;
        const bo = typeof b.signingOrder === 'number' ? b.signingOrder : 0;

        if (ao !== bo) {
          return ao - bo;
        }

        return a.id - b.id;
      });

    const primarySignerId = templateSignersOrdered[0]?.id ?? signerId;

    if (placeholders.length > 0) {
      await createTemplateFields(
        apiKey.trim(),
        templateId,
        placeholders.map((p) => ({
          recipientId: primarySignerId,
          type: p.type,
          placeholder: p.placeholder,
          ...(typeof p.matchAll === 'boolean' ? { matchAll: p.matchAll } : {}),
        })),
      );
    }

    /*
      Default list is signature-only for r1. create-document-from-template whiteouts every
      {{initials, rN}} in the PDF; without matching INITIALS fields, signers see blanks.
      When callers omit `placeholders`, add best-effort INITIALS (and extra SIGNER slots
      r2+) with the correct template recipientId per Documenso rN ordering.
    */
    if (usedBuiltInDefaultPlaceholders) {
      try {
        await createTemplateFields(apiKey.trim(), templateId, [
          {
            recipientId: primarySignerId,
            type: 'INITIALS',
            placeholder: '{{initials, r1}}',
            matchAll: true,
          },
        ]);
      } catch {
        // PDF has no {{initials, r1}}
      }

      for (let slot = 2; slot <= templateSignersOrdered.length; slot++) {
        const recipient = templateSignersOrdered[slot - 1];

        if (!recipient) {
          continue;
        }

        try {
          await createTemplateFields(apiKey.trim(), templateId, [
            {
              recipientId: recipient.id,
              type: 'SIGNATURE',
              placeholder: `{{signature, r${slot}}}`,
              matchAll: true,
            },
          ]);
        } catch {
          // No {{signature, rN}} in PDF
        }

        try {
          await createTemplateFields(apiKey.trim(), templateId, [
            {
              recipientId: recipient.id,
              type: 'INITIALS',
              placeholder: `{{initials, r${slot}}}`,
              matchAll: true,
            },
          ]);
        } catch {
          // No {{initials, rN}} in PDF
        }
      }
    }

    const result = await createEnvelope(apiKey.trim(), String(templateId), {
      recipientEmail,
      recipientName,
      title,
    });

    return cors(
      request,
      new Response(
        JSON.stringify({
          envelopeId: result.envelopeId,
          signingUrl: result.signingUrl,
          signingToken: result.signingToken,
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

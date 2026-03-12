/**
 * Local script to test the token-exchange flow:
 * 1. Get API token from token-exchange (POST /api/exchange)
 * 2. Upload a local PDF as a template via token-exchange (POST /api/template/create)
 * 3. Create a signable envelope from that template (POST /api/template/{id}/create-envelope)
 *
 * Run from apps/token-exchange: npx tsx scripts/test-live-api.ts
 * Requires .env (or .env.test) with TOKEN_EXCHANGE_URL, TOKEN_EXCHANGE_SECRET,
 * ORGANISATION_ID, SLUG, PDF_PATH, RECIPIENT_EMAIL.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

const TOKEN_EXCHANGE_URL = process.env.TOKEN_EXCHANGE_URL?.replace(/\/$/, '');
const TOKEN_EXCHANGE_SECRET = process.env.TOKEN_EXCHANGE_SECRET;
const ORGANISATION_ID = process.env.ORGANISATION_ID;
const SLUG = process.env.SLUG;
const PDF_PATH = process.env.PDF_PATH;
const RECIPIENT_EMAIL = process.env.RECIPIENT_EMAIL;
const RECIPIENT_NAME = process.env.RECIPIENT_NAME ?? 'Signer';
const TITLE = process.env.TITLE ?? 'Test envelope';

function fail(step: string, status?: number, body?: string): never {
  const msg =
    status != null
      ? `Step "${step}" failed (${status}): ${(body ?? '').slice(0, 500)}`
      : `Step "${step}": ${body ?? 'unknown error'}`;
  console.error(msg);
  process.exit(1);
}

function validateEnv(): void {
  const missing: string[] = [];
  if (!TOKEN_EXCHANGE_URL) missing.push('TOKEN_EXCHANGE_URL');
  if (!TOKEN_EXCHANGE_SECRET) missing.push('TOKEN_EXCHANGE_SECRET');
  if (!ORGANISATION_ID) missing.push('ORGANISATION_ID');
  if (!SLUG) missing.push('SLUG');
  if (!PDF_PATH) missing.push('PDF_PATH');
  if (!RECIPIENT_EMAIL) missing.push('RECIPIENT_EMAIL');
  if (missing.length > 0) {
    fail('validate env', undefined, `Missing env: ${missing.join(', ')}`);
  }
  const resolved = path.resolve(PDF_PATH!);
  if (!fs.existsSync(resolved)) {
    fail('validate env', undefined, `PDF_PATH does not exist: ${resolved}`);
  }
}

async function step1Exchange(): Promise<string> {
  const res = await fetch(`${TOKEN_EXCHANGE_URL}/api/exchange`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN_EXCHANGE_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ slug: SLUG, organisationId: ORGANISATION_ID }),
  });
  const text = await res.text();
  if (!res.ok) {
    fail('1.exchange', res.status, text);
  }
  let data: { apiKey?: string };
  try {
    data = JSON.parse(text) as { apiKey?: string };
  } catch {
    fail('1.exchange', res.status, text);
  }
  if (!data.apiKey?.trim()) {
    fail('1.exchange', res.status, text || 'Missing apiKey in response');
  }
  return data.apiKey.trim();
}

async function step2UploadTemplate(apiKey: string): Promise<number> {
  const resolvedPath = path.resolve(PDF_PATH!);
  const buffer = fs.readFileSync(resolvedPath);
  const blob = new Blob([buffer], { type: 'application/pdf' });
  const name = TITLE || path.basename(resolvedPath, path.extname(resolvedPath)) || 'Test template';

  const formData = new FormData();
  formData.append('file', blob, path.basename(resolvedPath));
  formData.append('name', name);

  const res = await fetch(`${TOKEN_EXCHANGE_URL}/api/template/create`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN_EXCHANGE_SECRET}`,
      'X-Documenso-API-Key': apiKey,
    },
    body: formData,
  });
  const text = await res.text();
  if (!res.ok) {
    fail('2.template create', res.status, text);
  }
  let data: { id?: number; authoringLink?: string };
  try {
    data = JSON.parse(text) as { id?: number; authoringLink?: string };
  } catch {
    fail('2.template create', res.status, text);
  }
  const id = data.id;
  if (id == null || !Number.isInteger(id) || id < 1) {
    fail('2.template create', res.status, text || 'Missing or invalid template id in response');
  }
  if (data.authoringLink) {
    console.log('  Authoring link (add recipients/fields):', data.authoringLink);
  }
  return id;
}

async function step3CreateEnvelope(
  apiKey: string,
  templateId: number,
): Promise<{
  envelopeId: string;
  signingUrl: string;
  signingToken: string;
}> {
  const res = await fetch(`${TOKEN_EXCHANGE_URL}/api/template/${templateId}/create-envelope`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN_EXCHANGE_SECRET}`,
      'X-Documenso-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      recipientEmail: RECIPIENT_EMAIL!,
      recipientName: RECIPIENT_NAME,
      title: TITLE || undefined,
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    fail('3.create envelope', res.status, text);
  }
  let data: { envelopeId?: string; signingUrl?: string; signingToken?: string };
  try {
    data = JSON.parse(text) as {
      envelopeId?: string;
      signingUrl?: string;
      signingToken?: string;
    };
  } catch {
    fail('3.create envelope', res.status, text);
  }
  if (!data.envelopeId || !data.signingUrl) {
    fail('3.create envelope', res.status, text || 'Missing envelopeId or signingUrl in response');
  }
  return {
    envelopeId: data.envelopeId,
    signingUrl: data.signingUrl,
    signingToken: data.signingToken ?? '',
  };
}

async function main(): Promise<void> {
  validateEnv();

  console.log('Step 1: Exchange (get API token)...');
  const apiKey = await step1Exchange();
  console.log('  Got apiKey');

  console.log('Step 2: Upload PDF as template (token-exchange)...');
  const templateId = await step2UploadTemplate(apiKey);
  console.log('  Template id:', templateId);

  console.log('Step 3: Create envelope from template (token-exchange)...');
  const envelope = await step3CreateEnvelope(apiKey, templateId);
  console.log('  Envelope id:', envelope.envelopeId);

  console.log('\n--- Success ---');
  console.log('Template id:', templateId);
  console.log('Envelope id:', envelope.envelopeId);
  console.log('Signing URL:', envelope.signingUrl);
  if (envelope.signingToken) {
    console.log('Signing token:', envelope.signingToken);
  }
}

void main();

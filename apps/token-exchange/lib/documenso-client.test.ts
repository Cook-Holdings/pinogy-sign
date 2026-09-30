import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';

import { buildTemplateUseOverride, createEnvelope, ENVELOPE_TITLE_MAX_LENGTH } from './documenso-client';

describe('buildTemplateUseOverride', () => {
  it('always turns the Upload signature option off', () => {
    assert.deepEqual(buildTemplateUseOverride({}), { uploadSignatureEnabled: false });
  });

  it('overrides a template that enabled Upload', () => {
    const override = buildTemplateUseOverride({
      templateMeta: { uploadSignatureEnabled: true, drawSignatureEnabled: true, typedSignatureEnabled: true },
    });

    assert.equal(override.uploadSignatureEnabled, false);
  });

  it("leaves Draw and Type to the template's own settings", () => {
    const override = buildTemplateUseOverride({
      templateMeta: { drawSignatureEnabled: true, typedSignatureEnabled: false },
    });

    assert.equal('drawSignatureEnabled' in override, false);
    assert.equal('typedSignatureEnabled' in override, false);
  });

  it('re-enables Draw when the template disabled both Draw and Type, so the document stays signable', () => {
    const override = buildTemplateUseOverride({
      templateMeta: { drawSignatureEnabled: false, typedSignatureEnabled: false, uploadSignatureEnabled: true },
    });

    assert.deepEqual(override, { uploadSignatureEnabled: false, drawSignatureEnabled: true });
  });

  it('re-enables Upload only when the caller explicitly opts in', () => {
    assert.equal(buildTemplateUseOverride({ allowUploadSignature: true }).uploadSignatureEnabled, true);
    assert.equal(buildTemplateUseOverride({ allowUploadSignature: false }).uploadSignatureEnabled, false);
  });

  it('does not force Draw on when an opted-in Upload keeps the document signable', () => {
    const override = buildTemplateUseOverride({
      allowUploadSignature: true,
      templateMeta: { drawSignatureEnabled: false, typedSignatureEnabled: false },
    });

    assert.equal('drawSignatureEnabled' in override, false);
  });

  it('passes a trimmed title through', () => {
    assert.equal(buildTemplateUseOverride({ title: '  Pet Paperwork for MOOSE  ' }).title, 'Pet Paperwork for MOOSE');
  });

  it('omits an empty or whitespace-only title so the template title is kept', () => {
    assert.equal('title' in buildTemplateUseOverride({ title: '' }), false);
    assert.equal('title' in buildTemplateUseOverride({ title: '   ' }), false);
    assert.equal('title' in buildTemplateUseOverride({ title: undefined }), false);
  });

  it("truncates the title to Documenso's limit", () => {
    const title = buildTemplateUseOverride({ title: 'x'.repeat(400) }).title;

    assert.equal(title?.length, ENVELOPE_TITLE_MAX_LENGTH);
  });
});

describe('createEnvelope', () => {
  const originalUrl = process.env.DOCUMENSO_URL;

  beforeEach(() => {
    process.env.DOCUMENSO_URL = 'https://sign.example.test';
  });

  afterEach(() => {
    mock.restoreAll();

    if (originalUrl === undefined) {
      delete process.env.DOCUMENSO_URL;
    } else {
      process.env.DOCUMENSO_URL = originalUrl;
    }
  });

  const mockDocumenso = () => {
    const calls: Array<{ url: string; body: unknown }> = [];

    const respond = (input: string | URL, init?: RequestInit): Response => {
      const url = String(input);
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });

      if (url.endsWith('/api/v2-beta/template/7')) {
        return new Response(
          JSON.stringify({
            id: 7,
            envelopeId: 'envelope_7',
            recipients: [{ id: 11, role: 'SIGNER', email: 'recipient.1@documenso.com', name: 'Signer' }],
            templateMeta: { uploadSignatureEnabled: true, drawSignatureEnabled: true, typedSignatureEnabled: true },
          }),
          { status: 200 },
        );
      }

      if (url.endsWith('/api/v2-beta/template/use')) {
        return new Response(
          JSON.stringify({ envelopeId: 'envelope_99', recipients: [{ token: 'tok_abc', role: 'SIGNER' }] }),
          { status: 200 },
        );
      }

      return new Response('not found', { status: 404 });
    };

    mock.method(globalThis, 'fetch', (input: string | URL, init?: RequestInit) =>
      Promise.resolve(respond(input, init)),
    );

    return calls;
  };

  it('sends the title and disables Upload on template/use', async () => {
    const calls = mockDocumenso();

    const result = await createEnvelope('api-key', '7', {
      recipientEmail: 'jane@example.com',
      recipientName: 'Jane',
      title: 'Pet Paperwork for MOOSE — Invoice 1234',
    });

    const useCall = calls.find((c) => c.url.endsWith('/template/use'));

    assert.ok(useCall);
    assert.deepEqual((useCall.body as { override: unknown }).override, {
      uploadSignatureEnabled: false,
      title: 'Pet Paperwork for MOOSE — Invoice 1234',
    });
    assert.equal((useCall.body as { distributeDocument: boolean }).distributeDocument, true);
    assert.equal(result.signingUrl, 'https://sign.example.test/sign/tok_abc');
  });

  it('forwards an explicit Upload opt-in', async () => {
    const calls = mockDocumenso();

    await createEnvelope('api-key', '7', { recipientEmail: 'jane@example.com', uploadSignatureEnabled: true });

    const useCall = calls.find((c) => c.url.endsWith('/template/use'));

    assert.ok(useCall);
    assert.deepEqual((useCall.body as { override: unknown }).override, { uploadSignatureEnabled: true });
  });

  it('disables Upload even when no title is given', async () => {
    const calls = mockDocumenso();

    await createEnvelope('api-key', '7', { recipientEmail: 'jane@example.com' });

    const useCall = calls.find((c) => c.url.endsWith('/template/use'));

    assert.ok(useCall);
    assert.deepEqual((useCall.body as { override: unknown }).override, { uploadSignatureEnabled: false });
  });
});

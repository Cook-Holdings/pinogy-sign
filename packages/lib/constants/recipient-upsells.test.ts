import { afterEach, describe, expect, it, vi } from 'vitest';

import { isRecipientUpsellEnabled } from './recipient-upsells';

describe('isRecipientUpsellEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is off when the variable is unset (the production default)', () => {
    vi.stubEnv('NEXT_PRIVATE_ENABLE_RECIPIENT_UPSELLS', undefined);

    expect(isRecipientUpsellEnabled()).toBe(false);
  });

  it.each(['', 'false', '1', 'TRUE', 'yes'])('is off for %j', (value) => {
    vi.stubEnv('NEXT_PRIVATE_ENABLE_RECIPIENT_UPSELLS', value);

    expect(isRecipientUpsellEnabled()).toBe(false);
  });

  it('is on only for exactly "true"', () => {
    vi.stubEnv('NEXT_PRIVATE_ENABLE_RECIPIENT_UPSELLS', 'true');

    expect(isRecipientUpsellEnabled()).toBe(true);
  });
});

import { FieldType } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { ZEnvelopeFieldAndMetaSchema } from '../../types/field-meta';
import type { PlaceholderInfo } from './auto-place-fields';
import { convertPlaceholdersToFieldInputs, MIN_SIGNATURE_FIELD_HEIGHT_PT } from './auto-place-fields';

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;

const toPercent = (points: number) => (points / PAGE_HEIGHT) * 100;

const createPlaceholder = (type: FieldType, box: { x: number; y: number; width: number; height: number }) =>
  ({
    placeholder: `{{${type}, r1}}`,
    recipient: 'r1',
    fieldAndMeta: ZEnvelopeFieldAndMetaSchema.parse({ type, fieldMeta: undefined }),
    page: 1,
    ...box,
    pageWidth: PAGE_WIDTH,
    pageHeight: PAGE_HEIGHT,
  }) satisfies PlaceholderInfo;

const convert = (placeholder: PlaceholderInfo) => {
  const [field] = convertPlaceholdersToFieldInputs([placeholder], () => ({ id: 1 }));

  return field;
};

describe('convertPlaceholdersToFieldInputs', () => {
  it('grows a one-line signature field upward to the minimum height, keeping its bottom edge', () => {
    const field = convert(createPlaceholder(FieldType.SIGNATURE, { x: 72, y: 700, width: 90, height: 12 }));

    expect(field.height).toBeCloseTo(toPercent(MIN_SIGNATURE_FIELD_HEIGHT_PT));
    expect(field.positionY).toBeCloseTo(toPercent(712 - MIN_SIGNATURE_FIELD_HEIGHT_PT));
    expect(field.positionY + field.height).toBeCloseTo(toPercent(712));
  });

  it('leaves the signature field width and x position alone', () => {
    const field = convert(createPlaceholder(FieldType.SIGNATURE, { x: 72, y: 700, width: 90, height: 12 }));

    expect(field.positionX).toBeCloseTo((72 / PAGE_WIDTH) * 100);
    expect(field.width).toBeCloseTo((90 / PAGE_WIDTH) * 100);
  });

  it('keeps a signature field that is already tall enough unchanged', () => {
    const field = convert(createPlaceholder(FieldType.SIGNATURE, { x: 72, y: 600, width: 200, height: 60 }));

    expect(field.positionY).toBeCloseTo(toPercent(600));
    expect(field.height).toBeCloseTo(toPercent(60));
  });

  it('does not grow a signature field above the top of the page', () => {
    const field = convert(createPlaceholder(FieldType.SIGNATURE, { x: 72, y: 10, width: 90, height: 12 }));

    expect(field.positionY).toBe(0);
    expect(field.height).toBeCloseTo(toPercent(22));
  });

  it('does not change non-signature fields, initials included', () => {
    for (const type of [FieldType.INITIALS, FieldType.DATE, FieldType.NAME]) {
      const field = convert(createPlaceholder(type, { x: 72, y: 700, width: 90, height: 12 }));

      expect(field.positionY).toBeCloseTo(toPercent(700));
      expect(field.height).toBeCloseTo(toPercent(12));
    }
  });

  it('still falls back to the default height for a zero-height non-signature placeholder', () => {
    const field = convert(createPlaceholder(FieldType.DATE, { x: 72, y: 700, width: 90, height: 0 }));

    expect(field.height).toBe(2);
  });

  it('does not change the placeholder box the whiteout uses', () => {
    const placeholder = createPlaceholder(FieldType.SIGNATURE, { x: 72, y: 700, width: 90, height: 12 });

    convert(placeholder);

    expect(placeholder.y).toBe(700);
    expect(placeholder.height).toBe(12);
  });
});

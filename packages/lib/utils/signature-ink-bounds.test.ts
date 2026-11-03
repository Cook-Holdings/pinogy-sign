import { describe, expect, it } from 'vitest';

import { getSignatureInkBounds } from './signature-ink-bounds';

const createImage = (width: number, height: number, inked: Array<[number, number]>) => {
  const data = new Uint8ClampedArray(width * height * 4);

  for (const [x, y] of inked) {
    data[(y * width + x) * 4 + 3] = 255;
  }

  return { data, width, height };
};

describe('getSignatureInkBounds', () => {
  it('returns null for a blank canvas', () => {
    expect(getSignatureInkBounds(createImage(10, 5, []))).toBeNull();
  });

  it('returns the tight rectangle around the ink', () => {
    const image = createImage(20, 10, [
      [4, 3],
      [9, 6],
      [6, 2],
    ]);

    expect(getSignatureInkBounds(image)).toEqual({ x: 4, y: 2, width: 6, height: 5 });
  });

  it('returns a 1x1 rectangle for a single inked pixel', () => {
    expect(getSignatureInkBounds(createImage(8, 8, [[3, 5]]))).toEqual({ x: 3, y: 5, width: 1, height: 1 });
  });

  it('grows the rectangle by the padding on every side', () => {
    const image = createImage(20, 10, [
      [5, 4],
      [8, 5],
    ]);

    expect(getSignatureInkBounds(image, 2)).toEqual({ x: 3, y: 2, width: 8, height: 6 });
  });

  it('clamps the padded rectangle to the canvas', () => {
    const image = createImage(10, 6, [
      [0, 0],
      [9, 5],
    ]);

    expect(getSignatureInkBounds(image, 4)).toEqual({ x: 0, y: 0, width: 10, height: 6 });
  });

  it('counts any non-zero alpha as ink, so antialiased stroke edges are kept', () => {
    const image = createImage(10, 10, [[5, 5]]);
    image.data[(2 * 10 + 1) * 4 + 3] = 1;

    expect(getSignatureInkBounds(image)).toEqual({ x: 1, y: 2, width: 5, height: 4 });
  });

  it('ignores colour in fully transparent pixels', () => {
    const image = createImage(10, 10, [[5, 5]]);
    image.data[0] = 255;
    image.data[1] = 255;
    image.data[2] = 255;

    expect(getSignatureInkBounds(image)).toEqual({ x: 5, y: 5, width: 1, height: 1 });
  });
});

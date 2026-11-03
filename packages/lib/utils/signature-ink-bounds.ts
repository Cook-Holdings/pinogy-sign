export type SignatureInkBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SignatureImageData = {
  data: Uint8ClampedArray;
  width: number;
  height: number;
};

/**
 * The rectangle of a drawn signature that actually holds ink, grown by
 * `padding` pixels on every side and clamped to the canvas.
 *
 * A drawn signature used to be stored as the whole signature pad canvas,
 * blank space included. The field renderer fits that whole image into the
 * field, so a signature drawn small in a large 16:7 pad came out a few points
 * wide in a short signature field, on screen and in the sealed PDF alike.
 * Cropping to this rectangle before storing the image makes the ink, rather
 * than the pad, fill the field.
 *
 * Any pixel with a non-zero alpha counts as ink, which matches how the pad's
 * own coverage check decides a signature is not blank.
 *
 * Returns `null` when the image holds no ink at all.
 */
export const getSignatureInkBounds = (
  { data, width, height }: SignatureImageData,
  padding = 0,
): SignatureInkBounds | null => {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * width * 4;

    for (let x = 0; x < width; x++) {
      if (data[rowOffset + x * 4 + 3] === 0) {
        continue;
      }

      if (x < minX) {
        minX = x;
      }

      if (x > maxX) {
        maxX = x;
      }

      if (y < minY) {
        minY = y;
      }

      if (y > maxY) {
        maxY = y;
      }
    }
  }

  if (maxX < 0) {
    return null;
  }

  const left = Math.max(0, minX - padding);
  const top = Math.max(0, minY - padding);
  const right = Math.min(width, maxX + 1 + padding);
  const bottom = Math.min(height, maxY + 1 + padding);

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
};

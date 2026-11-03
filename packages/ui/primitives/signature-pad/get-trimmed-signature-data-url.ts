import { SIGNATURE_CANVAS_DPI } from '@documenso/lib/constants/signatures';
import { getSignatureInkBounds } from '@documenso/lib/utils/signature-ink-bounds';

/**
 * Blank margin kept around the ink, in canvas pixels, so antialiased stroke
 * edges are not clipped flush against the image border.
 */
const SIGNATURE_TRIM_PADDING = 8 * SIGNATURE_CANVAS_DPI;

/**
 * A PNG data URL of the signature pad canvas, cropped to the drawn ink.
 *
 * The stored image is what every field renderer fits into the signature field
 * (on screen and when sealing the PDF), so storing the whole pad made the ink
 * a small fraction of the image and the rendered signature tiny. See
 * `getSignatureInkBounds`.
 *
 * A canvas with no ink is returned whole, exactly as before.
 */
export const getTrimmedSignatureDataUrl = (canvas: HTMLCanvasElement): string => {
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return canvas.toDataURL();
  }

  const bounds = getSignatureInkBounds(ctx.getImageData(0, 0, canvas.width, canvas.height), SIGNATURE_TRIM_PADDING);

  if (!bounds) {
    return canvas.toDataURL();
  }

  const trimmed = document.createElement('canvas');

  trimmed.width = bounds.width;
  trimmed.height = bounds.height;

  const trimmedCtx = trimmed.getContext('2d');

  if (!trimmedCtx) {
    return canvas.toDataURL();
  }

  trimmedCtx.drawImage(canvas, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);

  return trimmed.toDataURL();
};

import { canvasPreview } from './canvasPreview';

let previewUrl = '';

function toBlob(canvas) {
  return new Promise((resolve) => {
    canvas.toBlob(resolve);
  });
}

/**
 * Returns a preview image URL for a given crop, scale, and rotation.
 *
 * @param {HTMLImageElement} image - The original image element.
 * @param {Object} crop - Crop data with x, y, width, height.
 * @param {number} scale - Zoom factor.
 * @param {number} rotate - Rotation in degrees.
 * @returns {Promise<string>} - Object URL of the cropped image.
 */
export async function imgPreview(image, crop, scale = 1, rotate = 0) {
  const canvas = document.createElement('canvas');
  await canvasPreview(image, canvas, crop, scale, rotate);

  const blob = await toBlob(canvas);

  if (!blob) {
    console.error('Failed to create blob');
    return '';
  }

  // Revoke previous preview URL to free memory
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
  }

  previewUrl = URL.createObjectURL(blob);
  return previewUrl;
}

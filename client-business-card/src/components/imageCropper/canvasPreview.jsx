const TO_RADIANS = Math.PI / 180;

/**
 * Renders a cropped and transformed image preview onto a canvas.
 *
 * @param {HTMLImageElement} image - The source image.
 * @param {HTMLCanvasElement} canvas - The canvas to draw the preview on.
 * @param {Object} crop - The crop object with x, y, width, height.
 * @param {number} scale - The scale factor for zooming (default is 1).
 * @param {number} rotate - The rotation angle in degrees (default is 0).
 */
export async function canvasPreview(image, canvas, crop, scale = 1, rotate = 0) {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2d context');

  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  const pixelRatio = window.devicePixelRatio;

  canvas.width = Math.floor(crop.width * scaleX * pixelRatio);
  canvas.height = Math.floor(crop.height * scaleY * pixelRatio);

  ctx.scale(pixelRatio, pixelRatio);
  ctx.imageSmoothingQuality = 'high';

  const cropX = crop.x * scaleX;
  const cropY = crop.y * scaleY;
  const rotateRads = rotate * TO_RADIANS;
  const centerX = image.naturalWidth / 2;
  const centerY = image.naturalHeight / 2;

  ctx.save();

  ctx.translate(-cropX, -cropY);           // Move crop origin to canvas origin
  ctx.translate(centerX, centerY);         // Move origin to center of image
  ctx.rotate(rotateRads);                  // Rotate image
  ctx.scale(scale, scale);                 // Apply scaling
  ctx.translate(-centerX, -centerY);       // Move image back

  ctx.drawImage(
    image,
    0,
    0,
    image.naturalWidth,
    image.naturalHeight,
    0,
    0,
    image.naturalWidth,
    image.naturalHeight
  );

  ctx.restore();
}

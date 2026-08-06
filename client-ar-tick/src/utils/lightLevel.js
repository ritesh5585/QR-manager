// Estimates how dark the current camera frame is, cheaply enough to run
// on every frame. Downscales to a tiny 24x24 sample before measuring —
// full-resolution brightness analysis every frame would be wasteful,
// and we only need a rough signal ("is it too dark"), not precision.

let sampleCanvas = null;

export function getAverageBrightness(sourceCanvas, sampleSize = 24) {
  if (!sampleCanvas) {
    sampleCanvas = document.createElement("canvas");
  }
  sampleCanvas.width = sampleSize;
  sampleCanvas.height = sampleSize;

  const ctx = sampleCanvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(sourceCanvas, 0, 0, sampleSize, sampleSize);

  const { data } = ctx.getImageData(0, 0, sampleSize, sampleSize);

  let total = 0;
  const pixelCount = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    // Standard luminance weighting (human eyes are more sensitive to green)
    total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  return total / pixelCount; // 0 (black) .. 255 (white)
}

export function isDark(brightness, threshold = 60) {
  return brightness < threshold;
}

// Detects 4 solid-color square blocks (your card's actual corner markers)
// instead of decoding ArUco IDs. Returns up to 4 candidate blocks with
// their center point and outer corner point, ready for perspective warp.

export function detectCornerBlocks(cv, srcMat, options = {}) {
  const {
    // Tune these to your card's actual printed blue — start here, adjust
    // using the debug mask view in Step 4 below.
    hLow = 90,
    hHigh = 130, // Hue range for blue
    sLow = 60,
    sHigh = 255, // Saturation (avoid gray/white false positives)
    vLow = 40,
    vHigh = 255, // Value/brightness
    minArea = 800, // Ignore tiny noise blobs
    maxAreaRatio = 0.15, // Ignore anything bigger than 15% of the frame
  } = options;

  const hsv = new cv.Mat();
  cv.cvtColor(srcMat, hsv, cv.COLOR_RGBA2RGB);
  cv.cvtColor(hsv, hsv, cv.COLOR_RGB2HSV);

  const low = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [hLow, sLow, vLow, 0]);
  const high = new cv.Mat(hsv.rows, hsv.cols, hsv.type(), [
    hHigh,
    sHigh,
    vHigh,
    255,
  ]);
  const mask = new cv.Mat();
  cv.inRange(hsv, low, high, mask);

  // Clean up noise
  const kernel = cv.Mat.ones(5, 5, cv.CV_8U);
  cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, kernel);
  cv.morphologyEx(mask, mask, cv.MORPH_OPEN, kernel);

  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  cv.findContours(
    mask,
    contours,
    hierarchy,
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_SIMPLE,
  );

  const frameArea = srcMat.rows * srcMat.cols;
  const blocks = [];

  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const area = cv.contourArea(cnt);

    if (area > minArea && area < frameArea * maxAreaRatio) {
      const rect = cv.boundingRect(cnt);
      const aspectRatio = rect.width / rect.height;

      // Roughly square (0.6–1.6 ratio tolerates a tilted card)
      if (aspectRatio > 0.6 && aspectRatio < 1.6) {
        blocks.push({
          center: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
          rect,
          area,
        });
      }
    }
    cnt.delete();
  }

  hsv.delete();
  low.delete();
  high.delete();
  mask.delete();
  kernel.delete();
  contours.delete();
  hierarchy.delete();

  // Keep the 4 largest square-ish blocks found (most likely the real corners)
  return blocks.sort((a, b) => b.area - a.area).slice(0, 4);
}

// Same geometric sorting logic your project already uses for markers —
// reused here so the rest of the pipeline (warp, etc.) doesn't need to change.
export function orderBlocksForDocument(blocks) {
  if (!blocks || blocks.length < 4) return null;

  const sorted = [...blocks].sort((a, b) => a.center.x - b.center.x);
  const left = sorted.slice(0, 2).sort((a, b) => a.center.y - b.center.y);
  const right = sorted.slice(2).sort((a, b) => a.center.y - b.center.y);

  return {
    topLeft: left[0],
    bottomLeft: left[1],
    topRight: right[0],
    bottomRight: right[1],
  };
}

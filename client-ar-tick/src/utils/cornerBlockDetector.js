// Detects 4 solid-color square blocks (your card's actual corner markers)
// instead of decoding ArUco IDs. Returns up to 4 candidate blocks with
// their center point and outer corner point, ready for perspective warp.

export function detectCornerBlocks(cv, srcMat, options = {}) {
  const frameArea = srcMat.rows * srcMat.cols;
  const effectiveMinArea = options.minArea ?? Math.max(50, Math.round(frameArea * 0.0006));
  const maxAreaRatio = options.maxAreaRatio ?? 0.15;

  const {
    hLow = 80,
    hHigh = 140, // Hue range for blue/cyan
    sLow = 45,
    sHigh = 255,
    vLow = 30,
    vHigh = 255,
  } = options;

  let blocks = [];

  // Strategy 1: Color-based segmentation (HSV)
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

  const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
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

  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const area = cv.contourArea(cnt);

    if (area > effectiveMinArea && area < frameArea * maxAreaRatio) {
      const rect = cv.boundingRect(cnt);
      const aspectRatio = rect.width / rect.height;

      if (aspectRatio > 0.55 && aspectRatio < 1.7) {
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
  contours.delete();
  hierarchy.delete();

  // Strategy 2: Fallback for solid dark/black corner markers if color matching yields < 4
  if (blocks.length < 4) {
    const gray = new cv.Mat();
    cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);

    const thresh = new cv.Mat();
    cv.adaptiveThreshold(
      gray,
      thresh,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      11,
      2,
    );

    cv.morphologyEx(thresh, thresh, cv.MORPH_CLOSE, kernel);

    const darkContours = new cv.MatVector();
    const darkHierarchy = new cv.Mat();
    cv.findContours(
      thresh,
      darkContours,
      darkHierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE,
    );

    const darkBlocks = [];
    for (let i = 0; i < darkContours.size(); i++) {
      const cnt = darkContours.get(i);
      const area = cv.contourArea(cnt);

      if (area > effectiveMinArea && area < frameArea * maxAreaRatio) {
        const rect = cv.boundingRect(cnt);
        const aspectRatio = rect.width / rect.height;

        if (aspectRatio > 0.55 && aspectRatio < 1.7) {
          const solidity = area / (rect.width * rect.height);
          if (solidity > 0.6) {
            darkBlocks.push({
              center: {
                x: rect.x + rect.width / 2,
                y: rect.y + rect.height / 2,
              },
              rect,
              area,
            });
          }
        }
      }
      cnt.delete();
    }

    gray.delete();
    thresh.delete();
    darkContours.delete();
    darkHierarchy.delete();

    if (darkBlocks.length >= blocks.length) {
      blocks = darkBlocks;
    }
  }

  kernel.delete();

  // Keep the 4 largest candidate corner blocks
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

// Checks whether 4 ordered blocks actually look like a rectangular card,
// not just 4 unrelated blue blobs somewhere in frame. This is what stops
// "random detection" — count alone (>=4 blobs) was never enough proof.
export function isPlausibleCard(ordered, opts = {}) {
  const {
    minAspect = 0.35, // width/height — tune to your real card's ratio
    maxAspect = 0.85,
    maxDiagonalSkew = 0.35, // how "unequal" the two diagonals are allowed to be
  } = opts;

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const widthTop = dist(ordered.topLeft.center, ordered.topRight.center);
  const widthBottom = dist(
    ordered.bottomLeft.center,
    ordered.bottomRight.center,
  );
  const heightLeft = dist(ordered.topLeft.center, ordered.bottomLeft.center);
  const heightRight = dist(ordered.topRight.center, ordered.bottomRight.center);

  const avgWidth = (widthTop + widthBottom) / 2;
  const avgHeight = (heightLeft + heightRight) / 2;
  if (avgWidth < 1 || avgHeight < 1) return false;

  // A real card's 4 corners keep roughly the same width/height ratio.
  // Random unrelated blobs almost never happen to line up like this.
  const aspect = avgWidth / avgHeight;
  if (aspect < minAspect || aspect > maxAspect) return false;

  // A real rectangle's two diagonals are close to equal length.
  // Scattered blobs produce lopsided, very unequal diagonals.
  const diag1 = dist(ordered.topLeft.center, ordered.bottomRight.center);
  const diag2 = dist(ordered.topRight.center, ordered.bottomLeft.center);
  const diagSkew = Math.abs(diag1 - diag2) / Math.max(diag1, diag2);
  if (diagSkew > maxDiagonalSkew) return false;

  return true;
}

// Checks whether this frame's corner positions are close to last frame's —
// i.e. we're looking at the SAME physical card held steady, not a new
// random set of blobs that happened to also total 4 this frame.
export function cornersAreStable(current, previous, toleranceRatio = 0.06) {
  if (!previous) return false;

  const points = ["topLeft", "topRight", "bottomRight", "bottomLeft"];
  const scale = Math.hypot(
    current.topRight.center.x - current.topLeft.center.x,
    current.bottomLeft.center.y - current.topLeft.center.y,
  );
  const tolerance = scale * toleranceRatio;

  return points.every((key) => {
    const a = current[key].center;
    const b = previous[key].center;
    return Math.hypot(a.x - b.x, a.y - b.y) < tolerance;
  });
}

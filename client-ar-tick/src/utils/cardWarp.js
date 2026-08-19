// ============================================================
// WARP CARD
// ============================================================

export function warpCard(cv, cameraImage, corners, cardWidth, cardHeight) {
  try {
    // Corners from findCard are already mapped directly from reference card:
    // 0 = Top-Left (0, 0)
    // 1 = Top-Right (cardWidth, 0)
    // 2 = Bottom-Right (cardWidth, cardHeight)
    // 3 = Bottom-Left (0, cardHeight)
    const pts = (corners && corners.length === 4) ? corners : orderCorners(corners);

    // 1. Tell OpenCV where the card is
    const sourcePoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
      pts[0].x,
      pts[0].y,

      pts[1].x,
      pts[1].y,

      pts[2].x,
      pts[2].y,

      pts[3].x,
      pts[3].y,
    ]);

    // ------------------------------------------
    // 2. Tell OpenCV where we WANT the card
    // ------------------------------------------

    const destinationPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0,
      0,

      cardWidth,
      0,

      cardWidth,
      cardHeight,

      0,
      cardHeight,
    ]);

    // ------------------------------------------
    // 3. Calculate perspective transformation
    // ------------------------------------------

    const transform = cv.getPerspectiveTransform(
      sourcePoints,
      destinationPoints,
    );

    // ------------------------------------------
    // 4. Create the straight card
    // ------------------------------------------

    const warpedCard = new cv.Mat();

    const outputSize = new cv.Size(cardWidth, cardHeight);

    cv.warpPerspective(
      cameraImage,
      warpedCard,
      transform,
      outputSize,
      cv.INTER_LINEAR,
      cv.BORDER_CONSTANT,
      new cv.Scalar(255, 255, 255, 255),
    );

    // ------------------------------------------
    // 5. Clean temporary OpenCV objects
    // ------------------------------------------

    sourcePoints.delete();
    destinationPoints.delete();
    transform.delete();

    return warpedCard;
  } catch (error) {
    console.error("Card warp failed:", error);
    return null;
  }
}


function orderCorners(corners) {
  if (!corners || corners.length !== 4) {
    throw new Error("Exactly 4 card corners are required.");
  }

  // Find the center of the four corners.
  const center = corners.reduce(
    (result, point) => ({
      x: result.x + point.x / 4,
      y: result.y + point.y / 4,
    }),
    { x: 0, y: 0 },
  );

  // Calculate each corner's angle
  // around the center.
  const sortedCorners = [...corners].sort((a, b) => {
    const angleA = Math.atan2(a.y - center.y, a.x - center.x);

    const angleB = Math.atan2(b.y - center.y, b.x - center.x);

    return angleA - angleB;
  });

  // Angle sorting alone starts at the
  // left side of the card, so rotate the
  // array until top-left comes first.
  const topLeftIndex = sortedCorners.reduce(
    (bestIndex, point, index, array) => {
      const best = array[bestIndex];

      const pointScore = point.x + point.y;
      const bestScore = best.x + best.y;

      return pointScore < bestScore ? index : bestIndex;
    },
    0,
  );

  return [
    sortedCorners[topLeftIndex],

    sortedCorners[(topLeftIndex + 1) % 4],

    sortedCorners[(topLeftIndex + 2) % 4],

    sortedCorners[(topLeftIndex + 3) % 4],
  ];
}

export function extractROI(cv, warpedCard, roi) {
  const { x, y, width, height } = roi;

  // Convert percentage values into pixels.
  const xPosition = Math.round(x * warpedCard.cols);

  const yPosition = Math.round(y * warpedCard.rows);

  const roiWidth = Math.round(width * warpedCard.cols);

  const roiHeight = Math.round(height * warpedCard.rows);

  // Prevent ROI from going outside
  // the card image.
  const safeX = Math.max(0, Math.min(xPosition, warpedCard.cols - 1));

  const safeY = Math.max(0, Math.min(yPosition, warpedCard.rows - 1));

  const safeWidth = Math.min(roiWidth, warpedCard.cols - safeX);

  const safeHeight = Math.min(roiHeight, warpedCard.rows - safeY);

  if (safeWidth <= 0 || safeHeight <= 0) {
    console.error("Invalid ROI:", roi);

    return null;
  }

  const rectangle = new cv.Rect(safeX, safeY, safeWidth, safeHeight);

  return warpedCard.roi(rectangle);
}

// ============================================================
// DRAW CARD BORDER
// ============================================================

export function drawCardBounds(cv, image, corners, color = [0, 255, 0]) {
  const orderedCorners = orderCorners(corners);

  const lineColor = new cv.Scalar(color[0], color[1], color[2], 255);

  for (let i = 0; i < 4; i++) {
    const current = orderedCorners[i];

    const next = orderedCorners[(i + 1) % 4];

    cv.line(
      image,

      new cv.Point(current.x, current.y),

      new cv.Point(next.x, next.y),

      lineColor,

      3,
    );
  }

  return image;
}

const CONFIG = {
  // Document detection
  minCornerArea: 100,
  maxCornerArea: 5000,
  minAspectRatio: 0.7,
  maxAspectRatio: 1.3,
  minConvexity: 0.7,

  // Checkbox detection
  checkboxSize: 38,
  checkboxRows: 3,
  checkboxCols: 1,
  checkboxMinFill: 15,
  checkboxMaxFill: 85,

  // Image processing
  adaptiveBlockSize: 15,
  adaptiveC: 3,
  cannyThreshold1: 50,
  cannyThreshold2: 150,

  // Output
  outputWidth: 600,
  outputHeight: 1000,
};

/**
 * Detect document corners using contour analysis
 */
export const detectDocumentCorners = (cv, src) => {
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  try {
    // Convert to grayscale
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Gaussian blur to reduce noise
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    // Canny edge detection
    cv.Canny(blurred, edges, CONFIG.cannyThreshold1, CONFIG.cannyThreshold2);

    // Dilate edges to close gaps
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    cv.dilate(edges, edges, kernel);

    // Find contours
    cv.findContours(
      edges,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE,
    );

    let bestContour = null;
    let bestArea = 0;
    let bestCornerPoints = null;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);

      if (area < CONFIG.minCornerArea || area > CONFIG.maxCornerArea) {
        contour.delete();
        continue;
      }

      // Approximate polygon
      const approx = new cv.Mat();
      const perimeter = cv.arcLength(contour, true);
      const epsilon = 0.02 * perimeter;
      cv.approxPolyDP(contour, approx, epsilon, true);

      // Check if it's a quadrilateral
      if (approx.rows === 4) {
        const rect = cv.boundingRect(contour);
        const aspectRatio = rect.width / rect.height;

        // Check if squarish
        if (
          aspectRatio > CONFIG.minAspectRatio &&
          aspectRatio < CONFIG.maxAspectRatio
        ) {
          // Check convexity
          const hull = new cv.Mat();
          cv.convexHull(contour, hull);
          const hullArea = cv.contourArea(hull);
          const convexity = area / hullArea;
          hull.delete();

          if (convexity > CONFIG.minConvexity && area > bestArea) {
            bestArea = area;
            bestContour = contour;
            bestCornerPoints = [];

            for (let j = 0; j < approx.rows; j++) {
              const point = approx.data32S;
              const x = point[j * 2];
              const y = point[j * 2 + 1];
              bestCornerPoints.push([x, y]);
            }

            // Order points: top-left, top-right, bottom-right, bottom-left
            bestCornerPoints = orderPoints(bestCornerPoints);
          }
        }
      }
      approx.delete();
      contour.delete();
    }

    return {
      found: bestCornerPoints !== null,
      corners: bestCornerPoints,
      area: bestArea,
    };
  } finally {
    gray.delete();
    blurred.delete();
    edges.delete();
    contours.delete();
    hierarchy.delete();
  }
};

/**
 * Order corner points in clockwise direction
 */
const orderPoints = (pts) => {
  // Calculate center
  const center = pts.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
  center[0] /= pts.length;
  center[1] /= pts.length;

  // Sort by angle
  return pts.sort((a, b) => {
    const angleA = Math.atan2(a[1] - center[1], a[0] - center[0]);
    const angleB = Math.atan2(b[1] - center[1], b[0] - center[0]);
    return angleA - angleB;
  });
};

/**
 * Apply perspective correction
 */
export const warpDocument = (cv, src, corners, outputWidth, outputHeight) => {
  const srcPoints = cv.matFromArray(4, 1, cv.CV_32FC2, corners.flat());
  const dstPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0,
    0,
    outputWidth,
    0,
    outputWidth,
    outputHeight,
    0,
    outputHeight,
  ]);

  const M = cv.getPerspectiveTransform(srcPoints, dstPoints);
  const warped = new cv.Mat();
  const dsize = new cv.Size(outputWidth, outputHeight);

  cv.warpPerspective(
    src,
    warped,
    M,
    dsize,
    cv.INTER_LINEAR,
    cv.BORDER_CONSTANT,
    new cv.Scalar(),
  );

  // Cleanup
  srcPoints.delete();
  dstPoints.delete();
  M.delete();

  return warped;
};

/**
 * Detect checkbox positions in warped document
 */
export const detectCheckboxes = (cv, warped) => {
  const gray = new cv.Mat();
  cv.cvtColor(warped, gray, cv.COLOR_RGBA2GRAY);

  const checkboxPositions = [];
  const rows = CONFIG.checkboxRows;
  const cols = CONFIG.checkboxCols;
  const size = CONFIG.checkboxSize;

  // Calculate checkbox grid
  const cardWidth = warped.cols;
  const cardHeight = warped.rows;

  // Define checkbox regions (adjust based on your card layout)
  // For a card with 3 checkboxes vertically aligned
  const startX = Math.round(cardWidth * 0.07);
  const startY = Math.round(cardHeight * 0.45);
  const spacing = Math.round((cardHeight - startY - size * rows) / (rows + 1));

  for (let row = 0; row < rows; row++) {
    const y = startY + row * (size + spacing);
    const x = startX;

    checkboxPositions.push({
      row: row + 1,
      x: x,
      y: y,
      width: size,
      height: size,
      centerX: x + size / 2,
      centerY: y + size / 2,
    });
  }

  return checkboxPositions;
};

/**
 * Analyze a checkbox to determine if it's checked
 */
export const analyzeCheckbox = (cv, warped, position) => {
  const { x, y, width, height } = position;

  // Extract checkbox region
  const roi = new cv.Rect(x, y, width, height);
  const checkboxMat = warped.roi(roi);

  // Convert to grayscale
  const gray = new cv.Mat();
  if (checkboxMat.channels() > 1) {
    cv.cvtColor(checkboxMat, gray, cv.COLOR_RGBA2GRAY);
  } else {
    checkboxMat.copyTo(gray);
  }

  // Apply Otsu threshold
  const thresh = new cv.Mat();
  cv.threshold(gray, thresh, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

  // Remove border pixels (outer 20%)
  const inset = Math.round(Math.min(width, height) * 0.2);
  const innerRoi = new cv.Rect(
    inset,
    inset,
    width - 2 * inset,
    height - 2 * inset,
  );
  const innerMat = thresh.roi(innerRoi);

  // Count black pixels (ink/marks)
  const totalPixels = innerMat.rows * innerMat.cols;
  const blackPixels = cv.countNonZero(innerMat);
  const fillPercentage = (blackPixels / totalPixels) * 100;

  // Determine if checked
  const isChecked =
    fillPercentage >= CONFIG.checkboxMinFill &&
    fillPercentage <= CONFIG.checkboxMaxFill;

  // Calculate confidence
  let confidence = 0;
  if (isChecked) {
    confidence = Math.min(100, (fillPercentage / 50) * 100);
  } else {
    confidence = Math.max(0, 100 - (fillPercentage / 20) * 100);
  }

  // Cleanup
  checkboxMat.delete();
  gray.delete();
  thresh.delete();
  innerMat.delete();

  return {
    isChecked,
    confidence: Math.round(Math.min(Math.max(confidence, 0), 100)),
    fillPercentage: Math.round(fillPercentage),
    blackPixels,
    totalPixels,
  };
};

/**
 * Main detection function - unified pipeline
 */
export const detectDocumentAndCheckboxes = async ({
  cv,
  image,
  qrId,
  squareContent,
  navigate,
  setIsModalOpen,
  onDebug,
}) => {
  if (!cv || !image) {
    throw new Error("Invalid input: cv or image missing");
  }

  // Read image
  const src = cv.imread(image);

  if (src.empty()) {
    throw new Error("Failed to read image");
  }

  let warped = null;
  let results = [];
  let debugInfo = null;

  try {
    // STEP 1: Detect document corners
    console.log("🔍 Detecting document corners...");
    const cornerResult = detectDocumentCorners(cv, src);

    if (!cornerResult.found) {
      console.warn("⚠️ No document corners found");
      if (setIsModalOpen) setIsModalOpen(true);
      return { success: false, reason: "No corners found" };
    }

    console.log("✅ Document corners detected:", cornerResult.corners);

    // STEP 2: Warp document
    console.log("🔄 Warping document...");
    warped = warpDocument(
      cv,
      src,
      cornerResult.corners,
      CONFIG.outputWidth,
      CONFIG.outputHeight,
    );

    console.log("✅ Document warped:", warped.cols, "x", warped.rows);

    // STEP 3: Detect checkbox positions
    console.log("📐 Detecting checkbox positions...");
    const checkboxPositions = detectCheckboxes(cv, warped);
    console.log(`✅ Found ${checkboxPositions.length} checkbox positions`);

    // STEP 4: Analyze each checkbox
    console.log("🔬 Analyzing checkboxes...");
    const checkedBoxes = [];
    const allBoxes = [];

    for (const pos of checkboxPositions) {
      const analysis = analyzeCheckbox(cv, warped, pos);

      const content = squareContent?.[pos.row] || {
        title: `Option ${pos.row}`,
        fileType: "mp4",
      };

      const result = {
        number: pos.row,
        title: content.title,
        fileType: content.fileType,
        isChecked: analysis.isChecked,
        confidence: analysis.confidence,
        fillPercentage: analysis.fillPercentage,
        position: pos,
      };

      allBoxes.push(result);

      if (analysis.isChecked) {
        checkedBoxes.push(result);
      }
    }

    console.log(
      `✅ Found ${checkedBoxes.length} checked boxes:`,
      checkedBoxes.map((b) => b.number),
    );

    // STEP 5: Generate debug visualization
    if (onDebug) {
      const debugCanvas = document.createElement("canvas");
      cv.imshow(debugCanvas, warped);

      // Draw checkboxes on debug image
      const debugMat = warped.clone();
      for (const box of allBoxes) {
        const { x, y, width, height } = box.position;
        const color = box.isChecked ? [0, 255, 0] : [255, 0, 0];
        cv.rectangle(
          debugMat,
          new cv.Point(x, y),
          new cv.Point(x + width, y + height),
          new cv.Scalar(color[0], color[1], color[2]),
          2,
        );

        const label = `#${box.number}: ${box.isChecked ? "✓" : "✗"} ${box.confidence}%`;
        cv.putText(
          debugMat,
          label,
          new cv.Point(x + width + 10, y + height / 2 + 5),
          cv.FONT_HERSHEY_SIMPLEX,
          0.5,
          new cv.Scalar(0, 255, 255),
          1,
        );
      }

      const debugCanvas2 = document.createElement("canvas");
      cv.imshow(debugCanvas2, debugMat);

      debugInfo = {
        imageSize: { width: src.cols, height: src.rows },
        warpedSize: { width: CONFIG.outputWidth, height: CONFIG.outputHeight },
        corners: cornerResult.corners,
        checkboxes: allBoxes,
        checkedCount: checkedBoxes.length,
        fullImageUrl: debugCanvas2.toDataURL(),
        error: null,
      };

      onDebug(debugInfo);
      debugMat.delete();
      debugCanvas.remove();
      debugCanvas2.remove();
    }

    // STEP 6: Send results to backend
    if (checkedBoxes.length > 0 && qrId) {
      try {
        const payload = checkedBoxes.map((b) => ({
          number: b.number,
          title: b.title,
          fileType: b.fileType,
          confidence: b.confidence,
          fillPercentage: b.fillPercentage,
        }));

        console.log("📤 Sending results:", payload);

        // Assuming you have an API endpoint
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/qr/assign/${qrId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        // Success - navigate to results
        if (navigate) {
          navigate(`/result/${qrId}`);
        }

        return { success: true, checked: checkedBoxes };
      } catch (error) {
        console.error("❌ Failed to send results:", error);
        throw error;
      }
    } else {
      // No checkboxes found
      console.warn("⚠️ No checkboxes detected");
      if (setIsModalOpen) setIsModalOpen(true);
      return { success: false, reason: "No checkboxes detected" };
    }
  } catch (error) {
    console.error("❌ Detection error:", error);
    throw error;
  } finally {
    // Cleanup
    src.delete();
    if (warped) warped.delete();
  }
};

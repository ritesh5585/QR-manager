// src/utils/checkboxDetector.js
// COMPLETE FIXED VERSION - All functions properly exported

/**
 * ============================================================
 * DETECT ONE CHECKBOX
 * ============================================================
 */
export function detectCheckbox(cv, checkboxMat, threshold = 120) {
  try {
    const gray = new cv.Mat();

    if (checkboxMat.channels() > 1) {
      cv.cvtColor(checkboxMat, gray, cv.COLOR_RGBA2GRAY);
    } else {
      checkboxMat.copyTo(gray);
    }

    const binary = new cv.Mat();
    cv.threshold(gray, binary, threshold, 255, cv.THRESH_BINARY_INV);

    // Ignore border (outer 20%)
    const marginX = Math.round(gray.cols * 0.2);
    const marginY = Math.round(gray.rows * 0.2);
    const innerWidth = Math.max(1, gray.cols - marginX * 2);
    const innerHeight = Math.max(1, gray.rows - marginY * 2);
    const innerRectangle = new cv.Rect(
      marginX,
      marginY,
      innerWidth,
      innerHeight,
    );

    const innerArea = binary.roi(innerRectangle);
    const totalPixels = innerArea.rows * innerArea.cols;
    const inkPixels = cv.countNonZero(innerArea);
    const inkPercentage = (inkPixels / totalPixels) * 100;

    gray.delete();
    binary.delete();
    innerArea.delete();

    return inkPercentage;
  } catch (error) {
    console.error("Checkbox detection failed:", error);
    return 0;
  }
}

/**
 * ============================================================
 * COMPUTE GLOBAL THRESHOLD - ✅ UNCOMMENTED AND EXPORTED
 * ============================================================
 */
export function computeGlobalThreshold(cv, warped, checkboxConfigs) {
  try {
    // Get all checkbox regions
    const rois = checkboxConfigs.map((config) => ({
      x: config.roi.x,
      y: config.roi.y,
      width: config.roi.width,
      height: config.roi.height,
    }));

    // Calculate union bounding box
    const minX = Math.min(...rois.map((r) => r.x));
    const minY = Math.min(...rois.map((r) => r.y));
    const maxX = Math.max(...rois.map((r) => r.x + r.width));
    const maxY = Math.max(...rois.map((r) => r.y + r.height));

    const unionX = Math.round(minX * warped.cols);
    const unionY = Math.round(minY * warped.rows);
    const unionW = Math.round((maxX - minX) * warped.cols);
    const unionH = Math.round((maxY - minY) * warped.rows);

    const unionRoi = new cv.Rect(unionX, unionY, unionW, unionH);
    const band = warped.roi(unionRoi);

    const gray = new cv.Mat();
    cv.cvtColor(band, gray, cv.COLOR_RGBA2GRAY);

    const thresh = new cv.Mat();
    const threshold = cv.threshold(
      gray,
      thresh,
      0,
      255,
      cv.THRESH_BINARY_INV + cv.THRESH_OTSU,
    );

    band.delete();
    gray.delete();
    thresh.delete();

    return threshold;
  } catch (error) {
    console.error("❌ Global threshold error:", error);
    return 127;
  }
}

/**
 * ============================================================
 * ANALYZE ALL CHECKBOXES
 * ============================================================
 */
export function analyzeCheckboxes(cv, warpedCard, config, globalThreshold) {
  const results = [];
  const threshold = globalThreshold || 120;

  console.log("📊 Analyzing checkboxes with threshold:", threshold);
  console.log(
    "📊 Warped card dimensions:",
    warpedCard.cols,
    "x",
    warpedCard.rows,
  );

  for (const checkbox of config.checkboxes) {
    const { x, y, width, height } = checkbox.roi;

    const roiX = Math.round(x * warpedCard.cols);
    const roiY = Math.round(y * warpedCard.rows);
    const roiWidth = Math.round(width * warpedCard.cols);
    const roiHeight = Math.round(height * warpedCard.rows);

    console.log(`📊 Checkbox ${checkbox.number} ROI:`, {
      roiX,
      roiY,
      roiWidth,
      roiHeight,
    });

    const rectangle = new cv.Rect(roiX, roiY, roiWidth, roiHeight);
    const checkboxImage = warpedCard.roi(rectangle);

    const inkPercentage = detectCheckbox(cv, checkboxImage, threshold);

    results.push({
      number: checkbox.number,
      title: checkbox.title,
      fileType: checkbox.fileType,
      displayName: checkbox.displayName,
      fillPercentage: Math.round(inkPercentage),
      isChecked: false,
    });

    checkboxImage.delete();
  }

  console.log(
    "📊 Raw fill percentages:",
    results.map((r) => ({
      number: r.number,
      fill: r.fillPercentage + "%",
    })),
  );

  // Find baseline (minimum fill)
  const baseline = Math.min(...results.map((r) => r.fillPercentage));
  const margin = config.detection?.margin || 15;
  const minFill = config.detection?.minFillPercentage || 8;

  console.log(
    "📊 Baseline:",
    baseline + "%",
    "Margin:",
    margin,
    "Min Fill:",
    minFill,
  );

  // Determine which boxes are checked
  for (const result of results) {
    const diffFromBaseline = result.fillPercentage - baseline;
    result.isChecked =
      diffFromBaseline >= margin && result.fillPercentage >= minFill;
    result.diffFromBaseline = Math.round(diffFromBaseline);

    console.log(
      `📊 Box ${result.number}: fill=${result.fillPercentage}%, diff=${diffFromBaseline}%, checked=${result.isChecked}`,
    );
  }

  const checkedBoxes = results.filter((r) => r.isChecked);

  console.log(
    "✅ Checked boxes:",
    checkedBoxes.map((r) => r.number),
  );

  return {
    results,
    baseline,
    checkedCount: checkedBoxes.length,
    checkedBoxes,
  };
}

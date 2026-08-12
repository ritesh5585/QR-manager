// utils/checkboxDetector.js - Reference-style detector (proven working)

/**
 * ============================================================
 * REFERENCE-STYLE CHECKBOX DETECTOR
 *
 * Uses the proven approach from detectSquare.js:
 * 1. Fixed pixel coordinates on 600x1000 warped card
 * 2. Single global threshold from the entire checkbox band
 * 3. Baseline subtraction (empty box = minimum fill)
 * 4. Margin threshold for checking
 * ============================================================
 */

// Fixed checkbox positions on 600x1000 warped card
const CHECKBOX_POSITIONS = {
  1: { x: 63, y: 460, size: 39 }, // 10.5% of 600 = 63, 46% of 1000 = 460
  2: { x: 63, y: 610, size: 39 }, // 10.5% of 600 = 63, 61% of 1000 = 610
  3: { x: 63, y: 760, size: 38 }, // 10.5% of 600 = 63, 76% of 1000 = 760
};

const DETECTION_CONFIG = {
  cardWidth: 600,
  cardHeight: 1000,
  margin: 12, // Percentage points above baseline to count as checked
};

/**
 * Compute ONE global threshold from the entire ROI band
 * containing all checkboxes - gives stable, consistent threshold
 */
function calculateGlobalThreshold(cv, warped) {
  try {
    if (!warped || warped.empty()) {
      console.warn("⚠️ Invalid warped card for threshold calculation");
      return 120;
    }

    const boxes = Object.values(CHECKBOX_POSITIONS);

    const minX = Math.min(...boxes.map((b) => b.x));
    const minY = Math.min(...boxes.map((b) => b.y));
    const maxX = Math.max(...boxes.map((b) => b.x + b.size));
    const maxY = Math.max(...boxes.map((b) => b.y + b.size));

    // Ensure we have valid dimensions
    if (minX >= maxX || minY >= maxY) {
      console.warn("⚠️ Invalid checkbox band dimensions");
      return 120;
    }

    const band = warped.roi(new cv.Rect(minX, minY, maxX - minX, maxY - minY));
    const gray = new cv.Mat();
    cv.cvtColor(band, gray, cv.COLOR_RGBA2GRAY);

    const thresh = new cv.Mat();
    const t = cv.threshold(
      gray,
      thresh,
      0,
      255,
      cv.THRESH_BINARY_INV + cv.THRESH_OTSU,
    );

    // Cleanup
    gray.delete();
    thresh.delete();
    band.delete();

    // Ensure threshold is in valid range
    const validThreshold = Math.max(80, Math.min(180, t));
    console.log(`🎚️ Global threshold: ${validThreshold} (raw: ${t})`);

    return validThreshold;
  } catch (error) {
    console.error("❌ Global threshold calculation error:", error);
    return 120; // Fallback threshold
  }
}

/**
 * Measure a single checkbox using the global threshold
 */
function measureSingleCheckbox(cv, warped, position, globalThresh) {
  try {
    const { x, y, size } = position;

    // Validate position
    if (x < 0 || y < 0 || x + size > warped.cols || y + size > warped.rows) {
      console.warn(`⚠️ Checkbox position out of bounds: (${x}, ${y})`);
      return 0;
    }

    const roi = warped.roi(new cv.Rect(x, y, size, size));
    const gray = new cv.Mat();
    cv.cvtColor(roi, gray, cv.COLOR_RGBA2GRAY);

    const bin = new cv.Mat();
    cv.threshold(gray, bin, globalThresh, 255, cv.THRESH_BINARY_INV);

    const totalPixels = size * size;
    const darkPixels = cv.countNonZero(bin);
    const fillPercentage = (darkPixels / totalPixels) * 100;

    // Cleanup
    roi.delete();
    gray.delete();
    bin.delete();

    return fillPercentage;
  } catch (error) {
    console.error("❌ Checkbox measurement error:", error);
    return 0;
  }
}

/**
 * MAIN ANALYSIS FUNCTION - Uses reference-style detection
 */
export function analyzeCheckboxes(
  cv,
  warpedCard,
  config,
  globalThreshold = null,
  debug = false,
) {
  try {
    // --- 1. Validate inputs ---
    if (!warpedCard || warpedCard.empty()) {
      console.error("❌ Invalid warped card");
      return {
        results: [],
        checkedBoxes: [],
        checkedCount: 0,
        status: "NO_CARD",
        message: "No warped card available",
        debugImage: null,
        baseline: 0,
        globalThreshold: 120,
        margin: DETECTION_CONFIG.margin,
      };
    }

    // --- 2. Get checkbox titles from config ---
    const checkboxTitles = {};
    if (config?.checkboxes) {
      config.checkboxes.forEach((cb) => {
        checkboxTitles[cb.number] = cb.title || `Option ${cb.number}`;
      });
    }

    // --- 3. Compute global threshold ---
    const globalThresh =
      globalThreshold || calculateGlobalThreshold(cv, warpedCard);
    console.log(`🎚️ Using global threshold: ${globalThresh}`);

    // --- 4. Measure each checkbox ---
    const boxes = Object.entries(CHECKBOX_POSITIONS).map(([number, pos]) => ({
      number: parseInt(number),
      position: pos,
      fill: measureSingleCheckbox(cv, warpedCard, pos, globalThresh),
    }));

    // --- 5. Determine baseline (minimum fill - represents "empty") ---
    const baseline = Math.min(...boxes.map((b) => b.fill));
    console.log(`📊 Baseline (empty): ${baseline.toFixed(1)}%`);

    // --- 6. Determine which boxes are checked ---
    const MARGIN = DETECTION_CONFIG.margin;
    const results = boxes.map(({ number, position, fill }) => {
      const isChecked = fill - baseline >= MARGIN;
      const title = checkboxTitles[number] || `Option ${number}`;

      return {
        number,
        title,
        displayName: title,
        fillPercentage: Math.round(fill * 10) / 10,
        isChecked,
        // Debug info
        aboveBaseline: Math.round((fill - baseline) * 10) / 10,
        baseline: Math.round(baseline * 10) / 10,
        margin: MARGIN,
      };
    });

    // --- 7. Summary ---
    const checkedBoxes = results
      .filter((r) => r.isChecked)
      .map((r) => r.number);
    const checkedCount = checkedBoxes.length;

    console.log("📊 Checkbox Analysis:", {
      checkedCount,
      checkedBoxes,
      baseline: baseline.toFixed(1),
      results: results.map((r) => ({
        box: r.number,
        fill: `${r.fillPercentage}%`,
        aboveBaseline: `${r.aboveBaseline}%`,
        checked: r.isChecked,
      })),
    });

    // --- 8. Debug visualization ---
    let debugImage = null;
    if (debug) {
      debugImage = drawDebugOverlay(
        cv,
        warpedCard,
        results,
        globalThresh,
        baseline,
      );
    }

    return {
      results,
      checkedBoxes,
      checkedCount,
      status: checkedCount > 0 ? "TICK_FOUND" : "NO_TICK",
      message:
        checkedCount > 0
          ? `${checkedCount} checkbox(es) marked`
          : "No marks detected",
      baseline: Math.round(baseline * 10) / 10,
      globalThreshold: globalThresh,
      margin: MARGIN,
      debugImage,
    };
  } catch (error) {
    console.error("❌ analyzeCheckboxes error:", error);
    return {
      results: [],
      checkedBoxes: [],
      checkedCount: 0,
      status: "ERROR",
      message: `Detection error: ${error.message}`,
      debugImage: null,
      baseline: 0,
      globalThreshold: 120,
      margin: DETECTION_CONFIG.margin,
    };
  }
}

/**
 * Draw debug overlay showing detection results
 */
function drawDebugOverlay(cv, warpedCard, results, globalThresh, baseline) {
  try {
    if (!warpedCard || warpedCard.empty()) {
      return null;
    }

    const debugImage = new cv.Mat();
    warpedCard.copyTo(debugImage);

    for (const result of results) {
      const pos = CHECKBOX_POSITIONS[result.number];
      if (!pos) continue;

      const { x, y, size } = pos;

      // Color: green if checked, red if empty
      const color = result.isChecked
        ? new cv.Scalar(0, 255, 0, 255)
        : new cv.Scalar(255, 0, 0, 255);

      // Draw checkbox ROI
      cv.rectangle(
        debugImage,
        new cv.Point(x, y),
        new cv.Point(x + size, y + size),
        color,
        2,
      );

      // Draw label
      const status = result.isChecked ? "✓" : "□";
      const label = `#${result.number} ${status} ${result.fillPercentage}%`;
      cv.putText(
        debugImage,
        label,
        new cv.Point(x + size + 5, y + size / 2 + 5),
        cv.FONT_HERSHEY_SIMPLEX,
        0.5,
        color,
        1,
      );
    }

    // Add global info
    const infoText = `Threshold: ${globalThresh} | Baseline: ${baseline.toFixed(1)}% | Margin: ${DETECTION_CONFIG.margin}%`;
    cv.putText(
      debugImage,
      infoText,
      new cv.Point(10, 30),
      cv.FONT_HERSHEY_SIMPLEX,
      0.6,
      new cv.Scalar(255, 255, 0, 255),
      1,
    );

    return debugImage;
  } catch (error) {
    console.error("❌ Debug overlay error:", error);
    return null;
  }
}

/**
 * COMPUTE GLOBAL THRESHOLD - Public wrapper
 * Kept for backward compatibility with existing code
 */
export function computeGlobalThreshold(cv, warped, checkboxConfigs = null) {
  return calculateGlobalThreshold(cv, warped);
}

/**
 * LEGACY: detectCheckbox - kept for backward compatibility
 */
export function detectCheckbox(cv, checkboxMat, globalThresh = 120) {
  try {
    if (!checkboxMat || checkboxMat.empty()) {
      return {
        isChecked: false,
        markPercentage: 0,
        confidence: 0,
        reason: "INVALID_ROI",
      };
    }

    // Quick and simple detection for legacy calls
    const gray = new cv.Mat();
    if (checkboxMat.channels() > 1) {
      cv.cvtColor(checkboxMat, gray, cv.COLOR_RGBA2GRAY);
    } else {
      checkboxMat.copyTo(gray);
    }

    const bin = new cv.Mat();
    cv.threshold(gray, bin, globalThresh, 255, cv.THRESH_BINARY_INV);

    const totalPixels = gray.rows * gray.cols;
    const darkPixels = cv.countNonZero(bin);
    const markPercentage = (darkPixels / totalPixels) * 100;

    gray.delete();
    bin.delete();

    return {
      isChecked: markPercentage > 15,
      markPercentage: Math.round(markPercentage * 10) / 10,
      confidence: Math.min(90, markPercentage * 2),
      reason: markPercentage > 15 ? "MARK_DETECTED" : "NO_MARK",
    };
  } catch (error) {
    console.error("❌ Legacy detectCheckbox error:", error);
    return {
      isChecked: false,
      markPercentage: 0,
      confidence: 0,
      reason: "DETECTION_ERROR",
    };
  }
}

/**
 * LEGACY: detectCheckboxes - kept for backward compatibility
 */
export function detectCheckboxes(cv, warpedCard) {
  const result = analyzeCheckboxes(cv, warpedCard);
  return result.results || [];
}

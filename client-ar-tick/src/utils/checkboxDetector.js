// utils/checkboxDetector.js
// ============================================================
// v3 — DIFF-AGAINST-REFERENCE (standard OMR technique)
//
// Why the previous versions kept failing:
//   - Measuring "ink density" on an isolated checkbox crop means you're
//     trying to invent a universal threshold that separates "empty box +
//     border + paper texture + JPEG noise" from "ticked box" — using ONLY
//     that tiny crop's own pixels. Otsu/CLAHE on a 20-30px patch with
//     barely any ink doesn't have enough signal to find a stable cut point.
//     That's why fill% swung 38%->71% between two photos of the same card,
//     and why tightening the inset just made it swing to "nothing passes".
//
//   - The fix is to stop trying to classify each crop in isolation.
//     Diff the scanned crop against the SAME crop from a known-blank
//     reference card. Border, box outline, printed text, paper texture —
//     all identical in both images, so they cancel out in the subtraction.
//     What survives the diff is (mostly) just the pen/pencil mark itself.
//     This is exactly how OMR bubble-sheet scanners work.
// ============================================================

const ENGINE_VERSION = "checkboxDetector-v3-diff";
console.log(`[checkboxDetector] loaded ${ENGINE_VERSION}`);

const DEFAULT_DETECTION = {
  claheClipLimit: 2.0,
  claheGridSize: 8,
  // Small inset just to avoid edge-misalignment artifacts if the box
  // location is off by a pixel or two — not load-bearing like before,
  // because diffing already removes the border itself.
  insetPercent: 0.1,
  searchPaddingPercent: 0.6,
  // Per-pixel grayscale delta (0-255) between scan and reference to count
  // a pixel as "new ink".
  diffPixelDelta: 40,
  // % of a box's inner pixels that must be "new ink" for it to even be a
  // candidate mark.
  absoluteFloor: 4,
  absoluteCeiling: 90,
  // Ticked box's diff-fill must exceed the card's own least-marked box by
  // at least this many points. Still useful as a second safety net even
  // though diffing is far more stable than raw fill was.
  relativeDeltaOverBaseline: 6,
  minConfidence: 50,
};

function getDetectionConfig(cardConfig) {
  return { ...DEFAULT_DETECTION, ...(cardConfig?.detection || {}) };
}

function getExpectedRect(cb, cardWidth, cardHeight) {
  const size = (cb.size / 100) * cardWidth;
  return {
    x: (cb.x / 100) * cardWidth,
    y: (cb.y / 100) * cardHeight,
    width: size,
    height: size,
  };
}

/**
 * Build the canonical (cardWidth x cardHeight) blank-reference Mat, ONCE,
 * and cache it for the lifetime of the app. Call this after your existing
 * loadReferenceCard() gives you the reference Mat.
 *
 * Assumption: your reference image is already a reasonably front-on shot
 * of the blank card (which is true if you're using it for feature
 * matching already). If you have the reference card's 4 corners from your
 * matcher, prefer running it through warpCard() the same way you warp
 * live frames — that will line up pixel-for-pixel better than a plain
 * resize. Resize is the fallback/simple path.
 */
export function buildCanonicalReference(cv, referenceMat, cardWidth, cardHeight) {
  const resized = new cv.Mat();
  cv.resize(referenceMat, resized, new cv.Size(cardWidth, cardHeight), 0, 0, cv.INTER_AREA);
  return resized; // caller owns this Mat — cache it, delete only on teardown
}

/**
 * Bounded local search for the checkbox's real contour near its expected
 * position, to absorb small warp/homography drift between scans.
 */
function refineBoxLocation(cv, warpedCard, expected, det) {
  const cardWidth = warpedCard.cols;
  const cardHeight = warpedCard.rows;

  const padX = expected.width * det.searchPaddingPercent;
  const padY = expected.height * det.searchPaddingPercent;

  const winX = Math.max(0, Math.round(expected.x - padX));
  const winY = Math.max(0, Math.round(expected.y - padY));
  const winW = Math.min(cardWidth - winX, Math.round(expected.width + padX * 2));
  const winH = Math.min(cardHeight - winY, Math.round(expected.height + padY * 2));

  if (winW <= 0 || winH <= 0) return { ...expected };

  let windowMat, gray, enhanced, bin, contours, hierarchy, clahe;
  try {
    windowMat = warpedCard.roi(new cv.Rect(winX, winY, winW, winH));
    gray = new cv.Mat();
    cv.cvtColor(windowMat, gray, cv.COLOR_RGBA2GRAY);

    clahe = new cv.CLAHE(det.claheClipLimit, new cv.Size(det.claheGridSize, det.claheGridSize));
    enhanced = new cv.Mat();
    clahe.apply(gray, enhanced);

    bin = new cv.Mat();
    cv.threshold(enhanced, bin, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(bin, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let best = null;
    let bestScore = -Infinity;

    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      const rect = cv.boundingRect(c);
      const aspect = rect.width / rect.height;
      const sizeError = Math.abs(rect.width - expected.width) / expected.width;
      const isSquareEnough = aspect >= 0.7 && aspect <= 1.3;
      const isPlausibleSize = sizeError < 0.5;

      if (!isSquareEnough || !isPlausibleSize) continue;

      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      const centerErr = Math.hypot(cx - winW / 2, cy - winH / 2);
      const score = -(sizeError * 2 + centerErr / expected.width);

      if (score > bestScore) {
        bestScore = score;
        best = rect;
      }
    }

    if (!best) return { ...expected };

    return {
      x: winX + best.x,
      y: winY + best.y,
      width: best.width,
      height: best.height,
    };
  } catch (e) {
    console.error("refineBoxLocation error:", e);
    return { ...expected };
  } finally {
    if (windowMat) windowMat.delete();
    if (gray) gray.delete();
    if (enhanced) enhanced.delete();
    if (bin) bin.delete();
    if (contours) contours.delete();
    if (hierarchy) hierarchy.delete();
    if (clahe) clahe.delete();
  }
}

/**
 * Core of v3: diff the live crop against the same crop from the blank
 * reference card. This is what replaces threshold-guessing.
 */
function measureDiffFill(cv, warpedCard, referenceCanonical, rect, det) {
  const insetX = Math.round(rect.width * det.insetPercent);
  const insetY = Math.round(rect.height * det.insetPercent);
  const innerX = Math.round(rect.x + insetX);
  const innerY = Math.round(rect.y + insetY);
  const innerW = Math.max(1, Math.round(rect.width - insetX * 2));
  const innerH = Math.max(1, Math.round(rect.height - insetY * 2));
  const innerRect = { x: innerX, y: innerY, width: innerW, height: innerH };

  // No reference available — caller must fall back to legacy single-image
  // measurement (see measureFillLegacy below).
  if (!referenceCanonical) return null;

  let liveRoi, refRoi, liveGray, refGray, liveEq, refEq, diff, diffBin;
  try {
    const cvRect = new cv.Rect(innerX, innerY, innerW, innerH);
    liveRoi = warpedCard.roi(cvRect);
    refRoi = referenceCanonical.roi(cvRect);

    liveGray = new cv.Mat();
    refGray = new cv.Mat();
    cv.cvtColor(liveRoi, liveGray, cv.COLOR_RGBA2GRAY);
    cv.cvtColor(refRoi, refGray, cv.COLOR_RGBA2GRAY);

    // Light contrast normalization on BOTH crops with identical params, so
    // a global lighting difference between "when the reference photo was
    // taken" and "right now" doesn't itself register as a diff.
    const clahe = new cv.CLAHE(det.claheClipLimit, new cv.Size(det.claheGridSize, det.claheGridSize));
    liveEq = new cv.Mat();
    refEq = new cv.Mat();
    clahe.apply(liveGray, liveEq);
    clahe.apply(refGray, refEq);
    clahe.delete();

    diff = new cv.Mat();
    cv.absdiff(liveEq, refEq, diff);

    diffBin = new cv.Mat();
    cv.threshold(diff, diffBin, det.diffPixelDelta, 255, cv.THRESH_BINARY);

    const totalPixels = innerW * innerH;
    const changedPixels = cv.countNonZero(diffBin);
    const fillPercentage = (changedPixels / totalPixels) * 100;

    return { fillPercentage: Math.round(fillPercentage * 10) / 10, innerRect };
  } catch (e) {
    console.error("measureDiffFill error:", e);
    return { fillPercentage: 0, innerRect };
  } finally {
    if (liveRoi) liveRoi.delete();
    if (refRoi) refRoi.delete();
    if (liveGray) liveGray.delete();
    if (refGray) refGray.delete();
    if (liveEq) liveEq.delete();
    if (refEq) refEq.delete();
    if (diff) diff.delete();
    if (diffBin) diffBin.delete();
  }
}

/**
 * Fallback when no reference image is wired in yet: single-image fill
 * measurement. Kept only so the app doesn't hard-fail during migration —
 * expect this path to be less reliable than the diff path (see all the
 * comments above). Get a reference Mat wired in as soon as you can.
 */
function measureFillLegacy(cv, warpedCard, rect, det) {
  const insetX = Math.round(rect.width * det.insetPercent);
  const insetY = Math.round(rect.height * det.insetPercent);
  const innerX = Math.round(rect.x + insetX);
  const innerY = Math.round(rect.y + insetY);
  const innerW = Math.max(1, Math.round(rect.width - insetX * 2));
  const innerH = Math.max(1, Math.round(rect.height - insetY * 2));

  let roi, gray, enhanced, bin;
  try {
    roi = warpedCard.roi(new cv.Rect(innerX, innerY, innerW, innerH));
    gray = new cv.Mat();
    cv.cvtColor(roi, gray, cv.COLOR_RGBA2GRAY);

    const clahe = new cv.CLAHE(det.claheClipLimit, new cv.Size(det.claheGridSize, det.claheGridSize));
    enhanced = new cv.Mat();
    clahe.apply(gray, enhanced);
    clahe.delete();

    bin = new cv.Mat();
    cv.threshold(enhanced, bin, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

    const totalPixels = innerW * innerH;
    const darkPixels = cv.countNonZero(bin);
    const fillPercentage = (darkPixels / totalPixels) * 100;

    return {
      fillPercentage: Math.round(fillPercentage * 10) / 10,
      innerRect: { x: innerX, y: innerY, width: innerW, height: innerH },
    };
  } catch (e) {
    console.error("measureFillLegacy error:", e);
    return { fillPercentage: 0, innerRect: { x: innerX, y: innerY, width: innerW, height: innerH } };
  } finally {
    if (roi) roi.delete();
    if (gray) gray.delete();
    if (enhanced) enhanced.delete();
    if (bin) bin.delete();
  }
}

function drawDebugBox(cv, debugImage, outerRect, innerRect, number, fillPercentage, isTicked) {
  if (!debugImage) return;
  const color = isTicked ? new cv.Scalar(0, 255, 0, 255) : new cv.Scalar(255, 0, 0, 255);
  cv.rectangle(
    debugImage,
    new cv.Point(outerRect.x, outerRect.y),
    new cv.Point(outerRect.x + outerRect.width, outerRect.y + outerRect.height),
    new cv.Scalar(255, 255, 0, 255),
    2
  );
  cv.rectangle(
    debugImage,
    new cv.Point(innerRect.x, innerRect.y),
    new cv.Point(innerRect.x + innerRect.width, innerRect.y + innerRect.height),
    color,
    2
  );
  cv.putText(
    debugImage,
    `${isTicked ? "OK" : "x"} #${number} ${fillPercentage.toFixed(0)}%`,
    new cv.Point(outerRect.x + outerRect.width + 5, outerRect.y + outerRect.height / 2 + 5),
    cv.FONT_HERSHEY_SIMPLEX,
    0.5,
    color,
    2
  );
}

/**
 * ============================================================
 * MAIN ENTRY POINT
 * referenceCanonical: pass the Mat from buildCanonicalReference(). Pass
 * null/undefined to fall back to the legacy single-image path (works, but
 * expect the instability you've been seeing).
 * ============================================================
 */
export function analyzeCheckboxes(cv, warpedCard, cardConfig, referenceCanonical = null, debug = false) {
  try {
    if (!warpedCard || warpedCard.empty()) {
      return {
        results: [], checkedBoxes: [], checkedCount: 0,
        status: "NO_CARD", message: "No card detected",
        debugImage: null, isEmpty: true, engineVersion: ENGINE_VERSION,
      };
    }

    const boxes = cardConfig?.checkboxes || [];
    if (boxes.length === 0) {
      return {
        results: [], checkedBoxes: [], checkedCount: 0,
        status: "NO_CHECKBOXES", message: "No checkboxes configured for this card",
        debugImage: null, isEmpty: true, engineVersion: ENGINE_VERSION,
      };
    }

    const det = getDetectionConfig(cardConfig);
    const cardWidth = warpedCard.cols;
    const cardHeight = warpedCard.rows;
    const usingDiff = !!referenceCanonical;

    if (!usingDiff) {
      console.warn(
        "[checkboxDetector] No reference image wired in — using legacy single-image " +
        "fill measurement, which is known to be unstable. Call buildCanonicalReference() " +
        "and pass its result in as the 4th argument."
      );
    }

    let debugImage = null;
    if (debug) {
      debugImage = new cv.Mat();
      warpedCard.copyTo(debugImage);
    }

    // ---- PASS 1: locate every box and measure fill ---------------------
    const measured = boxes.map((cb) => {
      const expected = getExpectedRect(cb, cardWidth, cardHeight);
      const located = refineBoxLocation(cv, warpedCard, expected, det);
      const measurement = usingDiff
        ? measureDiffFill(cv, warpedCard, referenceCanonical, located, det)
        : measureFillLegacy(cv, warpedCard, located, det);
      return { cb, located, innerRect: measurement.innerRect, fillPercentage: measurement.fillPercentage };
    });

    const baseline = Math.min(...measured.map((m) => m.fillPercentage));

    // ---- PASS 2: classify -----------------------------------------------
    const allResults = measured.map(({ cb, located, innerRect, fillPercentage }) => {
      const overBaseline = fillPercentage - baseline;
      const passesAbsolute = fillPercentage >= det.absoluteFloor && fillPercentage <= det.absoluteCeiling;
      const passesRelative = overBaseline >= det.relativeDeltaOverBaseline;
      const isTicked = passesAbsolute && passesRelative;

      const confidence = Math.round(
        Math.max(5, Math.min(95, 40 + overBaseline - (isTicked ? 0 : 20)))
      );

      drawDebugBox(cv, debugImage, located, innerRect, cb.number, fillPercentage, isTicked);

      return {
        number: cb.number,
        title: cb.title || `Option ${cb.number}`,
        fillPercentage,
        overBaseline: Math.round(overBaseline * 10) / 10,
        isChecked: isTicked && confidence >= det.minConfidence,
        confidence,
        position: {
          x: Math.round(located.x), y: Math.round(located.y),
          width: Math.round(located.width), height: Math.round(located.height),
        },
      };
    });

    const tickedBoxes = allResults.filter((r) => r.isChecked);
    const tickedNumbers = tickedBoxes.map((r) => r.number);
    const tickedCount = tickedBoxes.length;
    const isEmpty = tickedCount === 0 && allResults.every((r) => r.fillPercentage < det.absoluteFloor);

    console.log("========================================");
    console.log(`CHECKBOX RESULTS (${ENGINE_VERSION}, mode=${usingDiff ? "diff" : "legacy"}) baseline ${baseline}%`);
    allResults.forEach((r) => {
      console.log(`#${r.number} ${r.isChecked ? "TICKED" : "empty"} fill=${r.fillPercentage}% (+${r.overBaseline}pt, conf ${r.confidence}%)`);
    });
    console.log(`Ticked: [${tickedNumbers.join(", ")}]`);
    console.log("========================================");

    return {
      checkedBoxes: tickedNumbers,
      checkedCount: tickedCount,
      results: allResults,
      status: tickedCount > 0 ? "TICK_FOUND" : "NO_TICK",
      message: tickedCount > 0 ? `${tickedCount} option(s) selected: ${tickedNumbers.join(", ")}` : "No options selected",
      isEmpty,
      debugImage,
      engineVersion: ENGINE_VERSION,
      mode: usingDiff ? "diff" : "legacy",
    };
  } catch (error) {
    console.error("analyzeCheckboxes error:", error);
    return {
      results: [], checkedBoxes: [], checkedCount: 0,
      status: "ERROR", message: "Detection error",
      debugImage: null, isEmpty: true, engineVersion: ENGINE_VERSION,
    };
  }
}

// ============================================================
// COMPATIBILITY SHIMS
// ============================================================
export function computeGlobalThreshold() {
  return 120;
}
export function detectCheckbox() {
  return { isChecked: false, markPercentage: 0, confidence: 0 };
}
export function detectCheckboxes(cv, warpedCard, cardConfig, referenceCanonical) {
  const result = analyzeCheckboxes(cv, warpedCard, cardConfig, referenceCanonical, false);
  return result.results || [];
}
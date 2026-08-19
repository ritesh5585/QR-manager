const ENGINE_VERSION = "checkboxDetector-v8-corrected";
console.log(`[checkboxDetector] loaded ${ENGINE_VERSION}`);

const DEFAULT_DETECTION = {
  // ROI padding - REDUCED to minimize registration noise
  paddingPercent: 0.15,  // was 0.35 - too much padding invites noise
  
  // Adaptive threshold parameters
  blockSize: 35,
  constantOffset: 5,
  
  // Morphological operations
  morphKernelSize: 3,
  
  // Stroke detection - RAISED to filter out noise
  minStrokeArea: 15,           // was 4 - kills single-pixel noise
  maxStrokeArea: 300,
  minDiagonalProjection: 0.25,
  
  // NEW: Actual discriminative threshold
  strokeAreaPercentThreshold: 2.5,  // was implicitly 0.3/0.5
  
  // Confidence threshold
  minConfidence: 50,
  
  // NEW: Fill ratio for discriminating real strokes from registration artifacts
  maxFillRatio: 0.65,  // real strokes are sparse within bbox
};

export function getDetectionConfig(cardConfig) {
  return { ...DEFAULT_DETECTION, ...(cardConfig?.detection || {}) };
}

export function getExpectedRect(cb, cardWidth, cardHeight) {
  const size = (cb.size / 100) * cardWidth;
  return {
    x: (cb.x / 100) * cardWidth,
    y: (cb.y / 100) * cardHeight,
    width: size,
    height: size,
  };
}

export function buildCanonicalReference(cv, referenceMat, cardWidth, cardHeight) {
  if (!referenceMat || referenceMat.empty()) {
    console.error("[checkboxDetector] Reference Mat is empty!");
    return null;
  }
  
  const resized = new cv.Mat();
  cv.resize(referenceMat, resized, new cv.Size(cardWidth, cardHeight), 0, 0, cv.INTER_AREA);
  console.log(`[checkboxDetector] Built reference: ${resized.cols}x${resized.rows}, channels=${resized.channels()}`);
  return resized;
}

// ============================================================
// HELPERS
// ============================================================

function toGraysafe(cv, mat) {
  if (!mat || mat.empty()) {
    throw new Error("Cannot convert empty Mat to grayscale");
  }
  
  const channels = mat.channels();
  
  if (channels === 1) {
    const clone = new cv.Mat();
    mat.copyTo(clone);
    return clone;
  }
  
  const gray = new cv.Mat();
  
  if (channels === 4) {
    cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
  } else if (channels === 3) {
    cv.cvtColor(mat, gray, cv.COLOR_BGR2GRAY);
  } else {
    cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
  }
  
  return gray;
}

function clampRect(rect, maxW, maxH) {
  const x = Math.max(0, Math.min(Math.round(rect.x), maxW - 1));
  const y = Math.max(0, Math.min(Math.round(rect.y), maxH - 1));
  const width = Math.max(1, Math.min(Math.round(rect.width), maxW - x));
  const height = Math.max(1, Math.min(Math.round(rect.height), maxH - y));
  return { x, y, width, height };
}

// ============================================================
// DISCRIMINATIVE STROKE DETECTION
// ============================================================

function detectStroke(cv, liveGray, referenceGray, det) {
  if (!liveGray || !referenceGray || liveGray.empty() || referenceGray.empty()) {
    console.warn("[detectStroke] Empty grayscale images");
    return createEmptyResult();
  }
  
  if (liveGray.rows !== referenceGray.rows || liveGray.cols !== referenceGray.cols) {
    console.warn("[detectStroke] Size mismatch");
    return createEmptyResult();
  }
  
  let liveThresh = null;
  let refThresh = null;
  let diff = null;
  let kernel = null;
  let morphedLive = null;
  let morphedRef = null;
  let refMask = null;
  let dilateKernel = null;
  let contours = null;
  let hierarchy = null;
  
  try {
    // Step 1: Adaptive threshold on both images
    liveThresh = new cv.Mat();
    refThresh = new cv.Mat();
    
    cv.adaptiveThreshold(
      liveGray,
      liveThresh,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      det.blockSize,
      det.constantOffset
    );
    
    cv.adaptiveThreshold(
      referenceGray,
      refThresh,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      det.blockSize,
      det.constantOffset
    );
    
    // Step 2: Morphological cleanup
    kernel = cv.getStructuringElement(
      cv.MORPH_ELLIPSE,
      new cv.Size(det.morphKernelSize, det.morphKernelSize)
    );
    
    morphedLive = new cv.Mat();
    morphedRef = new cv.Mat();
    cv.morphologyEx(liveThresh, morphedLive, cv.MORPH_OPEN, kernel);
    cv.morphologyEx(refThresh, morphedRef, cv.MORPH_OPEN, kernel);
    
    // Step 3: Dilate reference mask (account for alignment errors)
    refMask = new cv.Mat();
    dilateKernel = cv.getStructuringElement(
      cv.MORPH_ELLIPSE,
      new cv.Size(5, 5)
    );
    cv.dilate(morphedRef, refMask, dilateKernel);
    
    // Step 4: Subtract printed form from live image
    diff = new cv.Mat();
    cv.subtract(morphedLive, refMask, diff);
    cv.threshold(diff, diff, 5, 255, cv.THRESH_BINARY);
    
    // Step 5: Find connected components
    const tempDiff = diff.clone();
    contours = new cv.MatVector();
    hierarchy = new cv.Mat();
    cv.findContours(
      tempDiff,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE
    );
    tempDiff.delete();
    
    // Step 6: Analyze components with discriminative features
    let totalStrokeArea = 0;
    let strokeCount = 0;
    let maxStrokeArea = 0;
    let diagonalProjection = 0;
    const componentAreas = [];
    
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      
      // Filter by size - RAISED threshold
      if (area >= det.minStrokeArea && area <= det.maxStrokeArea) {
        componentAreas.push(area);
        totalStrokeArea += area;
        strokeCount++;
        if (area > maxStrokeArea) maxStrokeArea = area;
        
        // Step 6a: Calculate bounding box properties
        const rect = cv.boundingRect(contour);
        const aspectRatio = rect.width / Math.max(1, rect.height);
        const bboxArea = rect.width * rect.height;
        const fillRatio = bboxArea > 0 ? area / bboxArea : 1;
        
        // Step 6b: TRUE diagonal detection
        // Real tick: elongated + angled + sparse within bbox (low fill ratio)
        // Registration artifact: hugs printed edge = dense/rectangular (high fill ratio)
        const isDiagonal = aspectRatio > 0.25 && 
                          aspectRatio < 4.0 && 
                          fillRatio < det.maxFillRatio;
        
        if (isDiagonal) {
          diagonalProjection += area;
        }
        
        // Debug: log each component
        console.log(`[component] area=${area.toFixed(0)}px aspect=${aspectRatio.toFixed(2)} fill=${fillRatio.toFixed(2)} diag=${isDiagonal}`);
      }
    }
    
    // Step 7: Calculate features
    const totalPixels = liveGray.rows * liveGray.cols;
    const strokeAreaPercent = (totalStrokeArea / totalPixels) * 100;
    const diagonalPercent = totalStrokeArea > 0 
      ? (diagonalProjection / totalStrokeArea) * 100 
      : 0;
    const avgStrokeArea = strokeCount > 0 ? totalStrokeArea / strokeCount : 0;
    
    // Step 8: DISCRIMINATIVE decision logic
    // Each signal measures a DIFFERENT aspect
    const hasEnoughStrokeArea = strokeAreaPercent >= det.strokeAreaPercentThreshold;
    const hasDiagonalOrientation = diagonalPercent >= det.minDiagonalProjection * 100;
    const hasReasonableSize = avgStrokeArea >= det.minStrokeArea;
    const hasMultipleStrokes = strokeCount >= 2;  // Many ticks have 2+ strokes
    
    // True tick: enough area + diagonal + reasonable size
    // The diagonal check is now genuinely discriminative
    const isTicked = hasEnoughStrokeArea && 
                     hasDiagonalOrientation && 
                     hasReasonableSize;
    
    // Calculate confidence - based on how many independent signals pass
    let confidence = 0;
    if (isTicked) {
      // Base confidence from area (strongest signal)
      confidence = 50 + Math.min(30, (strokeAreaPercent - det.strokeAreaPercentThreshold) * 4);
      
      // Bonus for diagonal orientation
      confidence += Math.min(15, diagonalPercent * 0.2);
      
      // Bonus for multiple strokes (common in ticks)
      if (hasMultipleStrokes) confidence += 10;
      
      confidence = Math.min(95, Math.round(confidence));
    } else {
      // Partial confidence - only if we have some signals
      const signals = [hasEnoughStrokeArea, hasDiagonalOrientation, hasReasonableSize];
      const passed = signals.filter(s => s).length;
      confidence = Math.round((passed / signals.length) * 35) + 5;
    }
    
    // Debug output
    console.log(`[stroke] area=${strokeAreaPercent.toFixed(1)}% strokes=${strokeCount} diag=${diagonalPercent.toFixed(0)}% avg=${avgStrokeArea.toFixed(0)}px ticked=${isTicked} conf=${confidence}%`);
    
    return {
      isTicked,
      confidence,
      strokeAreaPercent,
      strokeCount,
      diagonalPercent,
      avgStrokeArea,
      maxStrokeArea,
      componentAreas,
      totalStrokeArea,
      signals: { 
        hasEnoughStrokeArea, 
        hasDiagonalOrientation, 
        hasReasonableSize,
        hasMultipleStrokes 
      },
    };
    
  } catch (e) {
    console.error("[detectStroke] Error:", e);
    return createEmptyResult(e.message);
  } finally {
    if (liveThresh) liveThresh.delete();
    if (refThresh) refThresh.delete();
    if (diff) diff.delete();
    if (kernel) kernel.delete();
    if (morphedLive) morphedLive.delete();
    if (morphedRef) morphedRef.delete();
    if (refMask) refMask.delete();
    if (dilateKernel) dilateKernel.delete();
    if (contours) contours.delete();
    if (hierarchy) hierarchy.delete();
  }
}

function createEmptyResult(error = null) {
  return {
    isTicked: false,
    confidence: 0,
    strokeAreaPercent: 0,
    strokeCount: 0,
    diagonalPercent: 0,
    avgStrokeArea: 0,
    maxStrokeArea: 0,
    componentAreas: [],
    totalStrokeArea: 0,
    signals: { 
      hasEnoughStrokeArea: false, 
      hasDiagonalOrientation: false, 
      hasReasonableSize: false,
      hasMultipleStrokes: false 
    },
    error: error,
  };
}

// ============================================================
// MAIN CHECKBOX MEASUREMENT
// ============================================================

function measureCheckbox(cv, warpedCard, referenceCard, expected, det) {
  const cardWidth = warpedCard.cols;
  const cardHeight = warpedCard.rows;
  
  // Get ROI with REDUCED padding
  const padX = expected.width * det.paddingPercent;
  const padY = expected.height * det.paddingPercent;
  
  const rect = clampRect(
    {
      x: expected.x - padX,
      y: expected.y - padY,
      width: expected.width + padX * 2,
      height: expected.height + padY * 2,
    },
    cardWidth, cardHeight
  );
  
  let liveRoi = null;
  let refRoi = null;
  let liveGray = null;
  let refGray = null;
  
  try {
    if (rect.width <= 0 || rect.height <= 0) {
      console.warn("[measureCheckbox] Invalid rect:", rect);
      return createEmptyResult("Invalid rectangle");
    }
    
    liveRoi = warpedCard.roi(new cv.Rect(rect.x, rect.y, rect.width, rect.height));
    refRoi = referenceCard.roi(new cv.Rect(rect.x, rect.y, rect.width, rect.height));
    
    liveGray = toGraysafe(cv, liveRoi);
    refGray = toGraysafe(cv, refRoi);
    
    const result = detectStroke(cv, liveGray, refGray, det);
    
    return {
      ...result,
      rect,
    };
    
  } catch (e) {
    console.error("[measureCheckbox] Error:", e);
    return createEmptyResult(e.message);
  } finally {
    if (liveRoi) liveRoi.delete();
    if (refRoi) refRoi.delete();
    if (liveGray) liveGray.delete();
    if (refGray) refGray.delete();
  }
}

// ============================================================
// MAIN EXPORTED FUNCTION
// ============================================================

export function analyzeCheckboxes(cv, warpedCard, cardConfig, referenceCanonical = null, debug = false) {
  try {
    if (!cv || !warpedCard || warpedCard.empty()) {
      console.error("[analyzeCheckboxes] Invalid input");
      return {
        results: [],
        checkedBoxes: [],
        checkedCount: 0,
        status: "NO_CARD",
        message: "No card detected",
        debugImage: null,
        isEmpty: true,
        engineVersion: ENGINE_VERSION,
      };
    }
    
    if (!referenceCanonical || referenceCanonical.empty()) {
      console.warn("[analyzeCheckboxes] No reference image - using fallback");
      return analyzeCheckboxesFallback(cv, warpedCard, cardConfig, debug);
    }
    
    const boxes = cardConfig?.checkboxes || [];
    if (boxes.length === 0) {
      return {
        results: [],
        checkedBoxes: [],
        checkedCount: 0,
        status: "NO_CHECKBOXES",
        message: "No checkboxes configured",
        debugImage: null,
        isEmpty: true,
        engineVersion: ENGINE_VERSION,
      };
    }
    
    const det = getDetectionConfig(cardConfig);
    const cardWidth = warpedCard.cols;
    const cardHeight = warpedCard.rows;
    
    let debugImage = null;
    if (debug) {
      debugImage = new cv.Mat();
      warpedCard.copyTo(debugImage);
    }
    
    const allResults = boxes.map((cb) => {
      const expected = getExpectedRect(cb, cardWidth, cardHeight);
      const measurement = measureCheckbox(cv, warpedCard, referenceCanonical, expected, det);
      
      if (debug && debugImage) {
        const color = measurement.isTicked 
          ? new cv.Scalar(0, 255, 0, 255) 
          : new cv.Scalar(255, 0, 0, 255);
        
        const r = measurement.rect;
        if (r) {
          cv.rectangle(
            debugImage,
            new cv.Point(r.x, r.y),
            new cv.Point(r.x + r.width, r.y + r.height),
            color,
            2
          );
          
          const label = `${measurement.isTicked ? '✓' : '✗'} #${cb.number} ${measurement.strokeAreaPercent?.toFixed(0) || 0}%`;
          cv.putText(
            debugImage,
            label,
            new cv.Point(Math.max(5, r.x), Math.max(15, r.y - 5)),
            cv.FONT_HERSHEY_SIMPLEX,
            0.5,
            color,
            2
          );
        }
      }
      
      return {
        number: cb.number,
        title: cb.title || `Option ${cb.number}`,
        isChecked: measurement.isTicked,
        confidence: measurement.confidence,
        strokeAreaPercent: measurement.strokeAreaPercent,
        strokeCount: measurement.strokeCount,
        diagonalPercent: measurement.diagonalPercent,
        avgStrokeArea: measurement.avgStrokeArea,
        signals: measurement.signals,
        position: measurement.rect ? {
          x: Math.round(measurement.rect.x),
          y: Math.round(measurement.rect.y),
          width: Math.round(measurement.rect.width),
          height: Math.round(measurement.rect.height),
        } : null,
        error: measurement.error || null,
      };
    });
    
    const tickedBoxes = allResults.filter((r) => r.isChecked);
    const tickedNumbers = tickedBoxes.map((r) => r.number);
    const tickedCount = tickedBoxes.length;
    
    console.log("========================================");
    console.log(`CHECKBOX RESULTS (${ENGINE_VERSION})`);
    console.log(`Ticked: ${tickedCount}/${allResults.length}`);
    allResults.forEach((r) => {
      const status = r.isChecked ? "✅ TICKED" : "❌ EMPTY";
      const s = r.signals || {};
      console.log(
        `#${r.number} ${status} area=${r.strokeAreaPercent?.toFixed(1) || 0}% strokes=${r.strokeCount || 0} diag=${r.diagonalPercent?.toFixed(0) || 0}% conf=${r.confidence || 0}%` +
        ` [${s.hasEnoughStrokeArea ? 'A' : ' '}${s.hasDiagonalOrientation ? 'D' : ' '}${s.hasReasonableSize ? 'R' : ' '}]` +
        (r.error ? ` [ERROR: ${r.error}]` : '')
      );
    });
    console.log(`Ticked boxes: [${tickedNumbers.join(", ")}]`);
    console.log("========================================");
    
    return {
      checkedBoxes: tickedNumbers,
      checkedCount: tickedCount,
      results: allResults,
      status: tickedCount > 0 ? "TICK_FOUND" : "NO_TICK",
      message: tickedCount > 0 
        ? `${tickedCount} option(s) selected: ${tickedNumbers.join(", ")}` 
        : "No options selected",
      isEmpty: tickedCount === 0,
      debugImage,
      engineVersion: ENGINE_VERSION,
      mode: "reference-mask",
    };
    
  } catch (error) {
    console.error("[analyzeCheckboxes] Fatal error:", error);
    return {
      results: [],
      checkedBoxes: [],
      checkedCount: 0,
      status: "ERROR",
      message: "Detection error: " + (error?.message || String(error)),
      debugImage: null,
      isEmpty: true,
      engineVersion: ENGINE_VERSION,
    };
  }
}

// ============================================================
// FALLBACK (when no reference is available)
// ============================================================

function analyzeCheckboxesFallback(cv, warpedCard, cardConfig, debug) {
  console.warn("[analyzeCheckboxesFallback] Using fallback detection");
  
  const boxes = cardConfig?.checkboxes || [];
  const det = getDetectionConfig(cardConfig);
  const cardWidth = warpedCard.cols;
  const cardHeight = warpedCard.rows;
  
  let debugImage = null;
  if (debug) {
    debugImage = new cv.Mat();
    warpedCard.copyTo(debugImage);
  }
  
  const results = boxes.map((cb) => {
    const expected = getExpectedRect(cb, cardWidth, cardHeight);
    const rect = clampRect(
      {
        x: expected.x - expected.width * 0.15,
        y: expected.y - expected.height * 0.15,
        width: expected.width * 1.3,
        height: expected.height * 1.3,
      },
      cardWidth, cardHeight
    );
    
    let roi = null;
    let gray = null;
    let darkPixels = 0;
    let totalPixels = 0;
    
    try {
      roi = warpedCard.roi(new cv.Rect(rect.x, rect.y, rect.width, rect.height));
      gray = toGraysafe(cv, roi);
      
      totalPixels = rect.width * rect.height;
      for (let y = 0; y < gray.rows; y++) {
        for (let x = 0; x < gray.cols; x++) {
          if (gray.ucharPtr(y, x)[0] < 80) {
            darkPixels++;
          }
        }
      }
    } catch (e) {
      console.error("[fallback] Error:", e);
    } finally {
      if (roi) roi.delete();
      if (gray) gray.delete();
    }
    
    const darkPercent = totalPixels > 0 ? (darkPixels / totalPixels) * 100 : 0;
    const isChecked = darkPercent > 8;
    
    if (debug && debugImage) {
      const color = isChecked 
        ? new cv.Scalar(0, 255, 0, 255) 
        : new cv.Scalar(255, 0, 0, 255);
      cv.rectangle(
        debugImage,
        new cv.Point(rect.x, rect.y),
        new cv.Point(rect.x + rect.width, rect.y + rect.height),
        color,
        2
      );
    }
    
    return {
      number: cb.number,
      title: cb.title || `Option ${cb.number}`,
      isChecked: isChecked,
      confidence: Math.min(80, 40 + darkPercent * 2),
      strokeAreaPercent: darkPercent,
      strokeCount: 0,
      diagonalPercent: 0,
      avgStrokeArea: 0,
      signals: { 
        hasEnoughStrokeArea: isChecked, 
        hasDiagonalOrientation: false, 
        hasReasonableSize: false,
        hasMultipleStrokes: false 
      },
      position: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      error: "Using fallback (no reference)",
    };
  });
  
  const tickedBoxes = results.filter((r) => r.isChecked);
  const tickedNumbers = tickedBoxes.map((r) => r.number);
  const tickedCount = tickedBoxes.length;
  
  return {
    checkedBoxes: tickedNumbers,
    checkedCount: tickedCount,
    results,
    status: tickedCount > 0 ? "TICK_FOUND" : "NO_TICK",
    message: tickedCount > 0 
      ? `${tickedCount} option(s) selected: ${tickedNumbers.join(", ")}` 
      : "No options selected",
    isEmpty: tickedCount === 0,
    debugImage,
    engineVersion: ENGINE_VERSION + "-fallback",
    mode: "fallback",
  };
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
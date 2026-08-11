// checkboxDetector.js - Clean, optimized, and accurate

export function analyzeCheckboxes(cv, warpedCard, config, globalThreshold = 120, debug = false) {
  const results = [];
  const checkedBoxes = [];
  const measurements = [];

  // Extract all ROIs
  for (const checkbox of config.checkboxes) {
    const roi = extractROI(cv, warpedCard, checkbox.roi);
    if (!roi) continue;

    const measurement = detectCheckbox(cv, roi);
    measurement.number = checkbox.number;
    measurements.push(measurement);
    roi.delete();
  }

  if (measurements.length === 0) {
    return { results: [], checkedCount: 0, checkedBoxes: [], baseline: 0 };
  }

  // Calculate baseline (median)
  const fills = measurements.map(m => m.fillPercentage).sort((a, b) => a - b);
  const baseline = fills[Math.floor(fills.length / 2)];

  // Determine checked status
  for (const m of measurements) {
    // A checkbox is checked if:
    // 1. Fill percentage is between 10% and 45% (tick mark range)
    // 2. Fill percentage is significantly above baseline (at least 5% higher)
    const isInTickRange = m.fillPercentage > 10 && m.fillPercentage < 45;
    const isAboveBaseline = (m.fillPercentage - baseline) > 5;
    const isChecked = isInTickRange && isAboveBaseline;
    
    results.push({
      number: m.number,
      fillPercentage: Math.round(m.fillPercentage),
      isChecked: isChecked,
      confidence: Math.round(m.confidence),
      diffFromBaseline: Math.round(m.fillPercentage - baseline),
    });

    if (isChecked) checkedBoxes.push(m.number);
  }

  return {
    results,
    checkedCount: checkedBoxes.length,
    checkedBoxes,
    baseline: Math.round(baseline),
  };
}

function extractROI(cv, warpedCard, roiConfig) {
  const { x, y, width, height } = roiConfig;
  const cardW = warpedCard.cols;
  const cardH = warpedCard.rows;
  
  const padding = 2;
  const roiX = Math.max(0, Math.floor(x * cardW) - padding);
  const roiY = Math.max(0, Math.floor(y * cardH) - padding);
  const roiW = Math.min(cardW - roiX, Math.ceil(width * cardW) + padding * 2);
  const roiH = Math.min(cardH - roiY, Math.ceil(height * cardH) + padding * 2);

  if (roiW <= 0 || roiH <= 0) return null;
  return warpedCard.roi(new cv.Rect(roiX, roiY, roiW, roiH));
}

function detectCheckbox(cv, roi) {
  try {
    // Convert to grayscale
    const gray = new cv.Mat();
    if (roi.channels() > 1) {
      cv.cvtColor(roi, gray, cv.COLOR_RGBA2GRAY);
    } else {
      roi.copyTo(gray);
    }

    // Simple threshold - no CLAHE needed for basic detection
    const binary = new cv.Mat();
    cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

    // Calculate fill percentage
    const total = binary.rows * binary.cols;
    const ink = cv.countNonZero(binary);
    const fillPercent = (ink / total) * 100;

    // Confidence calculation
    let confidence = 0;
    if (fillPercent > 10 && fillPercent < 45) {
      // Tick mark detected - confidence based on how close to ideal (25%)
      confidence = Math.min(100, Math.max(0, 100 - Math.abs(fillPercent - 25) * 2));
    } else if (fillPercent <= 10) {
      // Empty checkbox - confidence based on how empty
      confidence = Math.min(100, Math.max(0, (10 - fillPercent) * 10));
    } else {
      // Too filled - likely noise or mark
      confidence = Math.max(0, 100 - (fillPercent - 45) * 2);
    }

    gray.delete();
    binary.delete();

    return {
      fillPercentage: fillPercent,
      confidence: Math.round(confidence),
      isChecked: false, // Will be determined in analyzeCheckboxes
    };
  } catch (error) {
    console.error('Detection error:', error);
    return {
      fillPercentage: 0,
      confidence: 0,
      isChecked: false,
    };
  }
}

export function computeGlobalThreshold(cv, warpedCard, checkboxes) {
  const values = [];
  
  for (const checkbox of checkboxes) {
    const roi = extractROI(cv, warpedCard, checkbox.roi);
    if (!roi) continue;
    
    const gray = new cv.Mat();
    if (roi.channels() > 1) {
      cv.cvtColor(roi, gray, cv.COLOR_RGBA2GRAY);
    } else {
      roi.copyTo(gray);
    }
    
    const binary = new cv.Mat();
    const otsu = cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
    values.push(otsu);
    
    gray.delete();
    binary.delete();
    roi.delete();
  }

  if (values.length === 0) return 120;
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
}
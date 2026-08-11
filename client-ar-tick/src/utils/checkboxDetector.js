// utils/checkboxDetector.js - COMPLETE FIXED VERSION

/**
 * Computes global threshold for the warped card
 */
export function computeGlobalThreshold(cv, warped, checkboxes) {
  try {
    const gray = new cv.Mat();
    if (warped.channels() > 1) {
      cv.cvtColor(warped, gray, cv.COLOR_RGBA2GRAY);
    } else {
      warped.copyTo(gray);
    }
    const threshold = cv.threshold(gray, new cv.Mat(), 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    gray.delete();
    return threshold;
  } catch (error) {
    console.error("Threshold computation error:", error);
    return 128;
  }
}

/**
 * Enhanced tick detection with accurate confidence
 */
function detectTick(cv, roi, globalThreshold) {
  try {
    // Ensure ROI is valid
    if (!roi || roi.rows < 5 || roi.cols < 5) {
      return { hasTick: false, confidence: 0 };
    }

    const gray = new cv.Mat();
    if (roi.channels() > 1) {
      cv.cvtColor(roi, gray, cv.COLOR_RGBA2GRAY);
    } else {
      roi.copyTo(gray);
    }

    // Use adaptive threshold for tick detection
    const binary = new cv.Mat();
    cv.adaptiveThreshold(gray, binary, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 15, 3);

    // Morphological operations to enhance thin lines
    const kernel = cv.getStructuringElement(cv.MORPH_CROSS, new cv.Size(2, 2));
    const enhanced = new cv.Mat();
    cv.morphologyEx(binary, enhanced, cv.MORPH_DILATE, kernel);

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(enhanced, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let bestConfidence = 0;
    const roiArea = roi.rows * roi.cols;

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      
      // Area should be 0.5% - 25% of ROI
      const areaRatio = area / roiArea;
      if (areaRatio < 0.005 || areaRatio > 0.25) {
        contour.delete();
        continue;
      }

      const rect = cv.boundingRect(contour);
      const aspectRatio = rect.width / rect.height;
      
      // Tick marks are usually wider than tall
      if (aspectRatio < 0.4 || aspectRatio > 4.0) {
        contour.delete();
        continue;
      }

      // Approximate contour shape
      const peri = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, 0.025 * peri, true);
      const vertices = approx.rows;

      // Tick marks have 4-12 vertices
      if (vertices >= 4 && vertices <= 12) {
        const points = [];
        for (let j = 0; j < vertices; j++) {
          points.push({
            x: approx.data32S[j * 2],
            y: approx.data32S[j * 2 + 1]
          });
        }

        // Check for V-shape pattern
        let sharpAngles = 0;
        let totalAngle = 0;

        for (let j = 1; j < points.length - 1; j++) {
          const p1 = points[j - 1];
          const p2 = points[j];
          const p3 = points[j + 1];
          
          const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
          const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
          
          const dot = v1.x * v2.x + v1.y * v2.y;
          const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
          const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);
          
          if (mag1 > 2 && mag2 > 2) {
            const angle = Math.acos(Math.max(-1, Math.min(1, dot / (mag1 * mag2))));
            totalAngle += angle;
            
            // Sharp angle = V-shape (0.3 - 1.5 radians)
            if (angle > 0.3 && angle < 1.5) {
              sharpAngles++;
            }
          }
        }

        // Calculate bounding box coverage
        const bboxArea = rect.width * rect.height;
        const coverage = bboxArea > 0 ? area / bboxArea : 0;

        // CRITICAL: Proper confidence calculation (0-100)
        let confidence = 0;
        if (sharpAngles >= 2 && coverage > 0.25 && coverage < 0.85) {
          confidence = 50; // Base confidence for V-shape
          confidence += (coverage * 25); // Coverage factor (max +25)
          confidence += (vertices / 12) * 15; // Vertex factor (max +15)
          confidence += (sharpAngles / 4) * 10; // Sharp angle factor (max +10)
          confidence = Math.min(95, confidence); // Cap at 95% (never 100% for safety)
        }

        if (confidence > bestConfidence) {
          bestConfidence = confidence;
        }
      }
      approx.delete();
      contour.delete();
    }

    // Cleanup
    gray.delete();
    binary.delete();
    enhanced.delete();
    kernel.delete();
    contours.delete();
    hierarchy.delete();

    return {
      hasTick: bestConfidence > 45,
      confidence: Math.round(bestConfidence * 10) / 10
    };
  } catch (error) {
    console.error("Tick detection error:", error);
    return { hasTick: false, confidence: 0 };
  }
}

/**
 * Complete checkbox analysis with deterministic output
 */
export function analyzeCheckboxes(cv, warped, config, globalThreshold, debug = false) {
  try {
    const imgWidth = warped.cols;
    const imgHeight = warped.rows;

    // Convert to grayscale
    const gray = new cv.Mat();
    if (warped.channels() > 1) {
      cv.cvtColor(warped, gray, cv.COLOR_RGBA2GRAY);
    } else {
      warped.copyTo(gray);
    }

    // First pass: Extract all ROIs
    const allRoiData = [];
    for (const checkbox of config.checkboxes) {
      // CRITICAL FIX: Convert normalized to pixel coordinates
      const roi = checkbox.roi;
      const x = Math.round(roi.x * imgWidth);
      const y = Math.round(roi.y * imgHeight);
      const w = Math.round(roi.width * imgWidth);
      const h = Math.round(roi.height * imgHeight);

      // Ensure ROI is within bounds
      const safeX = Math.max(0, Math.min(x, imgWidth - w));
      const safeY = Math.max(0, Math.min(y, imgHeight - h));
      const safeW = Math.min(w, imgWidth - safeX);
      const safeH = Math.min(h, imgHeight - safeY);

      const roiMat = gray.roi(new cv.Rect(safeX, safeY, safeW, safeH));
      const data = roiMat.data;
      
      // Calculate fill percentage with threshold
      let darkPixels = 0;
      const total = data.length;
      const localThreshold = globalThreshold * 0.85; // Slightly lower for tick detection
      
      for (let i = 0; i < data.length; i++) {
        if (data[i] < localThreshold) darkPixels++;
      }

      const fillPercentage = (darkPixels / total) * 100;
      
      allRoiData.push({
        checkbox,
        roiMat,
        x: safeX,
        y: safeY,
        w: safeW,
        h: safeH,
        fillPercentage,
        darkPixels,
        total,
      });
    }

    // Calculate baseline (average fill of all ROIs)
    const avgFill = allRoiData.reduce((sum, d) => sum + d.fillPercentage, 0) / allRoiData.length;
    
    // Calculate standard deviation
    const variance = allRoiData.reduce((sum, d) => sum + Math.pow(d.fillPercentage - avgFill, 2), 0) / allRoiData.length;
    const stdDev = Math.sqrt(variance);

    const results = [];

    // Second pass: Analyze each ROI
    for (let i = 0; i < allRoiData.length; i++) {
      const data = allRoiData[i];
      const { checkbox, roiMat, x, y, w, h, fillPercentage } = data;

      // Detect tick in ROI
      const tickResult = detectTick(cv, roiMat, globalThreshold);
      
      // Fill confidence
      const minFill = config.detection?.minFillPercentage || 20;
      const isFilled = fillPercentage >= minFill;
      const fillConfidence = Math.min(90, (fillPercentage / 35) * 100);

      // DECISION LOGIC
      let isChecked = false;
      let confidence = 0;
      let detectionMethod = 'none';

      // 1. PRIMARY: Tick detection
      if (tickResult.hasTick && tickResult.confidence > 45) {
        isChecked = true;
        confidence = tickResult.confidence;
        detectionMethod = 'tick';
      }
      
      // 2. SECONDARY: Fill detection (significantly above baseline)
      if (!isChecked && fillPercentage > avgFill + stdDev * 1.5 && fillPercentage > 18) {
        isChecked = true;
        confidence = Math.max(confidence, Math.min(80, fillConfidence));
        detectionMethod = 'fill';
      }

      // 3. TERTIARY: Comparative with neighbors
      if (!isChecked) {
        const neighborFills = allRoiData
          .filter((d, idx) => idx !== i)
          .map(d => d.fillPercentage);
        const avgNeighborFill = neighborFills.reduce((a, b) => a + b, 0) / neighborFills.length;
        
        if (fillPercentage > avgNeighborFill + 12 && fillPercentage > 15) {
          isChecked = true;
          confidence = Math.max(confidence, 55);
          detectionMethod = 'comparative';
        }
      }

      // CRITICAL: Cap confidence at 95% (never 100% for safety)
      confidence = Math.min(95, confidence);

      results.push({
        number: checkbox.number,
        title: checkbox.title,
        roi: { x, y, width: w, height: h },
        fillPercentage: Math.round(fillPercentage * 10) / 10,
        isChecked: isChecked,
        confidence: Math.round(confidence * 10) / 10,
        detectionMethod: detectionMethod,
        tickConfidence: tickResult.confidence || 0,
        fillConfidence: Math.round(fillConfidence * 10) / 10,
        baselineFill: Math.round(avgFill * 10) / 10,
      });

      roiMat.delete();
    }

    gray.delete();

    // ============================================================
    // CRITICAL: POST-PROCESSING - ENSURE ONLY ONE CHECKBOX
    // ============================================================
    const checkedCandidates = results.filter(r => r.isChecked);
    let finalCheckedBoxes = [];
    
    if (checkedCandidates.length === 0) {
      // No checkbox detected
      console.log("ℹ️ No checkbox detected");
    } else if (checkedCandidates.length === 1) {
      // Perfect - exactly one detected
      finalCheckedBoxes = [checkedCandidates[0].number];
      console.log(`✅ Single checkbox detected: #${finalCheckedBoxes[0]}`);
    } else {
      // Multiple detected - pick the one with HIGHEST CONFIDENCE
      const best = checkedCandidates.reduce((a, b) => 
        (a.confidence || 0) > (b.confidence || 0) ? a : b
      );
      
      // Only keep the best one
      finalCheckedBoxes = [best.number];
      
      // Mark others as unchecked
      results.forEach(r => {
        if (r.number !== best.number) {
          r.isChecked = false;
          r.confidence = 0;
          r.detectionMethod = 'none';
        }
      });
      
      console.log(`⚠️ Multiple detected, selected best: #${finalCheckedBoxes[0]} (${best.confidence}%)`);
    }

    // Final update
    results.forEach(r => {
      r.isChecked = finalCheckedBoxes.includes(r.number);
      if (!r.isChecked) {
        r.confidence = 0;
        r.detectionMethod = 'none';
      }
    });

    console.log(`📊 FINAL: ${finalCheckedBoxes.length} checkbox(es): [${finalCheckedBoxes.join(', ')}]`);
    console.log('📈 Details:', results.map(r => ({
      number: r.number,
      isChecked: r.isChecked,
      fill: r.fillPercentage,
      method: r.detectionMethod,
      confidence: r.confidence,
      tickConf: r.tickConfidence,
    })));

    return {
      results,
      checkedBoxes: finalCheckedBoxes,
      checkedCount: finalCheckedBoxes.length,
      baseline: Math.round(avgFill * 10) / 10,
      debugImage: null,
    };
  } catch (error) {
    console.error("Checkbox analysis error:", error);
    return {
      results: [],
      checkedBoxes: [],
      checkedCount: 0,
      baseline: 0,
      debugImage: null,
    };
  }
}

export default {
  computeGlobalThreshold,
  analyzeCheckboxes,
};
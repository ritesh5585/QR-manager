// ============================================
// FILE: utils/detectSquare.js (FIXED - ERROR HANDLING)
// ============================================

import { toast } from "react-hot-toast";

// ✅ FIXED: Proper mapping with correct titles and file types
const CHECKBOX_MAPPING = {
  1: {
    id: 1,
    title: "i_eat_while_distracted",
    fileType: "mp4",
    displayName: "I Eat While Distracted",
    position: { x: 26, y: 455, size: 38 },
  },
  2: {
    id: 2,
    title: "i_eat_in_a_hurry",
    fileType: "mp4",
    displayName: "I Eat In A Hurry",
    position: { x: 26, y: 595, size: 38 },
  },
  3: {
    id: 3,
    title: "i_eat_mindfully",
    fileType: "jpg",
    displayName: "I Eat Mindfully",
    position: { x: 26, y: 735, size: 38 },
  },
};

const CONFIG = {
  cardWidth: 600,
  cardHeight: 1000,
  margin: 12, // Percentage points above baseline to count as a real mark
};

/**
 * Compute ONE global threshold from the entire ROI band containing all checkboxes
 */
const computeGlobalThreshold = (cv, warped, boxes) => {
  const minX = Math.min(...boxes.map((b) => b.position.x));
  const minY = Math.min(...boxes.map((b) => b.position.y));
  const maxX = Math.max(...boxes.map((b) => b.position.x + b.position.size));
  const maxY = Math.max(...boxes.map((b) => b.position.y + b.position.size));

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

  gray.delete();
  thresh.delete();
  band.delete();

  return t;
};

/**
 * Measure a single checkbox using the global threshold
 */
const measureBox = (cv, warped, box, globalThresh) => {
  const { x, y, size } = box.position;
  const roi = warped.roi(new cv.Rect(x, y, size, size));
  const gray = new cv.Mat();
  cv.cvtColor(roi, gray, cv.COLOR_RGBA2GRAY);

  const bin = new cv.Mat();
  cv.threshold(gray, bin, globalThresh, 255, cv.THRESH_BINARY_INV);

  const totalPixels = size * size;
  const blackPixels = cv.countNonZero(bin);
  const fillPercentage = (blackPixels / totalPixels) * 100;

  roi.delete();
  gray.delete();
  bin.delete();

  return fillPercentage;
};

/**
 * MAIN DETECTION FUNCTION - With proper error handling
 */
export const detectSquares = async ({
  cv,
  imgRef,
  qrId,
  navigate,
  setIsModalOpen,
  onDebug,
}) => {
  if (!cv || !imgRef?.current) {
    console.error("❌ Invalid: cv or imgRef missing");
    return { success: false, reason: "invalid_input" };
  }

  const img = imgRef.current;
  const src = cv.imread(img);

  if (src.empty()) {
    console.error("❌ Failed to read image");
    if (setIsModalOpen) setIsModalOpen(true);
    return { success: false, reason: "no_image" };
  }

  let warped = null;
  let debugMat = null;

  try {
    console.log("📐 Processing image:", src.cols, "x", src.rows);

    warped = new cv.Mat();
    cv.resize(
      src,
      warped,
      new cv.Size(CONFIG.cardWidth, CONFIG.cardHeight),
      0,
      0,
      cv.INTER_LINEAR,
    );

    console.log("📐 Warped:", warped.cols, "x", warped.rows);

    const boxesArr = Object.values(CHECKBOX_MAPPING);

    // Compute global threshold
    console.log("🔍 Computing global threshold...");
    const globalThresh = computeGlobalThreshold(cv, warped, boxesArr);
    console.log("📊 Global threshold:", globalThresh);

    // Measure each checkbox
    const fills = boxesArr.map((b) => ({
      box: b,
      fill: measureBox(cv, warped, b, globalThresh),
    }));

    // Determine baseline (minimum fill)
    const baseline = Math.min(...fills.map((f) => f.fill));
    console.log("📊 Baseline (minimum fill):", baseline.toFixed(1), "%");

    // Determine which boxes are checked
    const MARGIN = CONFIG.margin;
    const results = fills.map(({ box, fill }) => ({
      number: box.id,
      title: box.title,
      fileType: box.fileType,
      displayName: box.displayName,
      fillPercentage: Math.round(fill),
      isChecked: fill - baseline >= MARGIN,
    }));

    console.log(
      "📊 Results:",
      results.map((r) => ({
        number: r.number,
        title: r.title,
        fill: r.fillPercentage + "%",
        isChecked: r.isChecked,
        above_baseline: (r.fillPercentage - baseline).toFixed(1) + "%",
      })),
    );

    const checkedBoxes = results.filter((r) => r.isChecked);
    console.log(
      `✅ Found ${checkedBoxes.length} checked boxes:`,
      checkedBoxes.map((r) => `#${r.number}: ${r.title}`).join(", "),
    );

    // Debug visualization
    if (onDebug) {
      try {
        debugMat = warped.clone();
        results.forEach((result) => {
          const checkbox = CHECKBOX_MAPPING[result.number];
          const color = result.isChecked ? [0, 255, 0] : [255, 0, 0];
          cv.rectangle(
            debugMat,
            new cv.Point(checkbox.position.x, checkbox.position.y),
            new cv.Point(
              checkbox.position.x + checkbox.position.size,
              checkbox.position.y + checkbox.position.size,
            ),
            new cv.Scalar(color[0], color[1], color[2]),
            3,
          );

          const label = `#${result.number}: ${result.isChecked ? "✓" : "✗"} ${result.fillPercentage}%`;
          cv.putText(
            debugMat,
            label,
            new cv.Point(
              checkbox.position.x + checkbox.position.size + 10,
              checkbox.position.y + checkbox.position.size / 2 + 5,
            ),
            cv.FONT_HERSHEY_SIMPLEX,
            0.5,
            new cv.Scalar(0, 255, 255),
            1,
          );
        });

        const debugCanvas = document.createElement("canvas");
        cv.imshow(debugCanvas, debugMat);

        onDebug({
          imageSize: { width: src.cols, height: src.rows },
          warpedSize: { width: CONFIG.cardWidth, height: CONFIG.cardHeight },
          globalThreshold: globalThresh,
          baseline: Math.round(baseline),
          margin: MARGIN,
          checkboxes: results,
          checkedCount: checkedBoxes.length,
          fullImageUrl: debugCanvas.toDataURL(),
          error: null,
        });

        debugCanvas.remove();
      } catch (debugError) {
        console.error("Debug error:", debugError);
      }
    }

    // ============================================
    // FIXED: SEPARATE ERROR PATHS
    // ============================================

    // Case 1: No checkboxes detected (genuine case)
    if (checkedBoxes.length === 0) {
      console.warn("⚠️ No checkboxes detected on the card");
      if (setIsModalOpen) setIsModalOpen(true);
      return { success: false, reason: "none_detected" };
    }

    // Case 2: Checkboxes detected - try to save
    if (checkedBoxes.length > 0 && qrId) {
      try {
        const payload = checkedBoxes.map((r) => ({
          number: r.number,
          title: r.title,
          fileType: r.fileType,
          fillPercentage: r.fillPercentage,
        }));

        console.log(
          "📤 Sending checked boxes:",
          JSON.stringify(payload, null, 2),
        );

        // FIXED: Add ngrok-skip-browser-warning header
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/qr/assign/${qrId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              "ngrok-skip-browser-warning": "true", // Bypass ngrok interstitial
            },
            body: JSON.stringify(payload),
          },
        );

        // FIXED: Read as text first, then parse JSON
        const rawText = await response.text();
        console.log("📥 Raw response:", rawText.slice(0, 200));

        let responseData;
        try {
          responseData = JSON.parse(rawText);
        } catch (parseError) {
          throw new Error(
            `Backend returned non-JSON (status ${response.status}). ` +
              `First 60 chars: ${rawText.slice(0, 60)}`,
          );
        }

        if (!response.ok) {
          throw new Error(
            responseData?.message || `API error: ${response.status}`,
          );
        }

        console.log("✅ Server response:", responseData);
        toast.success(`✅ Found ${checkedBoxes.length} option(s)`);

        if (navigate) {
          navigate(`/result/${qrId}`);
        }

        return { success: true, checked: checkedBoxes };
      } catch (error) {
        // Network/save error - NOT "no checkboxes"
        console.error("❌ Save error:", error);
        toast.error(
          "Could not save your result — check your connection and try again.",
        );
        // Don't open the "no checkboxes" modal - this is a network error
        return { success: false, reason: "network", error: error.message };
      }
    }

    // Fallback
    if (setIsModalOpen) setIsModalOpen(true);
    return { success: false, reason: "unknown" };
  } catch (error) {
    // Unexpected error during detection
    console.error("❌ Detection error:", error);
    toast.error("Detection failed: " + error.message);
    if (setIsModalOpen) setIsModalOpen(true);
    return { success: false, reason: "detection_error", error: error.message };
  } finally {
    src.delete();
    if (warped) warped.delete();
    if (debugMat) debugMat.delete();
  }
};

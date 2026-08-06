import { assignQR } from "../service/api.service";
import { toast } from "react-hot-toast";

// ============ UTILITY FUNCTIONS ============

// Target normalized card dimensions for consistent checkbox positioning
const CARD_WIDTH = 600;
const CARD_HEIGHT = 1000;

// ROI covering the checkbox area
const getROI = () => {
  return {
    x: 20,
    y: 260,
    width: 560,
    height: 600,
  };
};

// Returns checkbox region for index 0, 1, 2 (1st, 2nd, 3rd checkbox)
const getCheckboxRegion = (index) => {
  const checkboxSize = 38;
  const leftX = 26;

  // Vertical centers for the 3 checkboxes on 600x1000 card
  const yPositions = [455, 595, 735];

  return {
    x: leftX,
    y: yPositions[index] - Math.round(checkboxSize / 2),
    width: checkboxSize,
    height: checkboxSize,
  };
};

// Analyze checkbox region by counting inner pen ink/check mark pixels
const analyzeCheckbox = (cv, checkboxMat) => {
  let gray = checkboxMat;
  let needsCleanup = false;

  if (checkboxMat.channels() > 1) {
    gray = new cv.Mat();
    cv.cvtColor(checkboxMat, gray, cv.COLOR_RGBA2GRAY);
    needsCleanup = true;
  }

  // Strip away the outer border of the printed checkbox by analyzing the inner 60% center region
  const insetX = Math.round(gray.cols * 0.2);
  const insetY = Math.round(gray.rows * 0.2);
  const insetW = Math.max(1, gray.cols - insetX * 2);
  const insetH = Math.max(1, gray.rows - insetY * 2);

  const innerRoi = new cv.Rect(insetX, insetY, insetW, insetH);
  const innerMat = gray.roi(innerRoi);

  // Apply OTSU binary thresholding to isolate ink/marks from paper inside the checkbox
  const thresh = new cv.Mat();
  cv.threshold(innerMat, thresh, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

  const totalPixels = thresh.rows * thresh.cols;
  const blackPixels = cv.countNonZero(thresh);
  const fillPercentage = (blackPixels / totalPixels) * 100;

  // Inner box filled pixels:
  // Unmarked empty box: 0% - 10% ink (white paper inside)
  // Marked checked box: > 15% - 85% ink (pen mark/tick inside)
  const isChecked = fillPercentage >= 15;

  let confidence = 0;
  if (isChecked) {
    confidence = Math.min(100, Math.round((fillPercentage / 40) * 100));
  } else {
    confidence = Math.max(0, Math.round(100 - (fillPercentage / 15) * 100));
  }

  innerMat.delete();
  if (needsCleanup) {
    gray.delete();
  }
  thresh.delete();

  return {
    isChecked,
    confidence: Math.min(Math.max(confidence, 0), 100),
    fillPercentage: Math.round(fillPercentage),
    blackPixels,
    totalPixels,
  };
};

// ============ MAIN DETECTION FUNCTION ============

export const detectSquares = async ({
  cv,
  imgRef,
  qrId,
  squareContent,
  navigate,
  setIsModalOpen,
  onDebug,
}) => {
  if (!cv || !imgRef?.current) return;

  const img = imgRef.current;
  const src = cv.imread(img);

  if (src.empty()) {
    console.error("❌ Failed to read image into OpenCV Mat");
    return;
  }

  try {
    // Standardize input image to 600x1000 for pixel-perfect checkbox alignment
    const warped = new cv.Mat();
    cv.resize(src, warped, new cv.Size(CARD_WIDTH, CARD_HEIGHT), 0, 0, cv.INTER_LINEAR);

    const roi = getROI();
    const debugMat = warped.clone();

    // Draw ROI bounds on debug canvas
    const roiPt1 = new cv.Point(roi.x, roi.y);
    const roiPt2 = new cv.Point(roi.x + roi.width, roi.y + roi.height);
    cv.rectangle(debugMat, roiPt1, roiPt2, new cv.Scalar(0, 0, 255), 2);

    const totalCheckboxes = 3;
    const results = [];
    const debugCheckboxes = [];

    for (let i = 0; i < totalCheckboxes; i++) {
      const region = getCheckboxRegion(i);

      const cropX = Math.max(0, Math.min(region.x, CARD_WIDTH - 1));
      const cropY = Math.max(0, Math.min(region.y, CARD_HEIGHT - 1));
      const cropW = Math.min(region.width, CARD_WIDTH - cropX);
      const cropH = Math.min(region.height, CARD_HEIGHT - cropY);

      if (cropW > 0 && cropH > 0) {
        const checkboxMat = warped.roi(new cv.Rect(cropX, cropY, cropW, cropH));
        const analysis = analyzeCheckbox(cv, checkboxMat);

        const color = analysis.isChecked ? [0, 255, 0] : [255, 0, 0];
        cv.rectangle(
          debugMat,
          new cv.Point(cropX, cropY),
          new cv.Point(cropX + cropW, cropY + cropH),
          new cv.Scalar(color[0], color[1], color[2]),
          3
        );

        const label = `#${i + 1}: ${analysis.isChecked ? "CHECKED" : "EMPTY"} (${analysis.fillPercentage}%)`;
        cv.putText(
          debugMat,
          label,
          new cv.Point(cropX + cropW + 10, cropY + Math.round(cropH / 2) + 4),
          cv.FONT_HERSHEY_SIMPLEX,
          0.45,
          new cv.Scalar(0, 255, 255),
          1
        );

        const itemContent = squareContent?.[i + 1] || {
          title: `Checkbox ${i + 1}`,
          fileType: "mp4",
        };

        const result = {
          number: i + 1,
          title: itemContent.title,
          fileType: itemContent.fileType,
          ...analysis,
          crop: { x: cropX, y: cropY, width: cropW, height: cropH },
        };

        results.push(result);
        debugCheckboxes.push(result);

        checkboxMat.delete();
      }
    }

    // Pass debug details if handler present
    if (onDebug) {
      try {
        const debugCanvas = document.createElement("canvas");
        cv.imshow(debugCanvas, debugMat);

        onDebug({
          imageSize: { width: src.cols, height: src.rows },
          warpedSize: { width: CARD_WIDTH, height: CARD_HEIGHT },
          roi,
          checkboxes: debugCheckboxes,
          fullImageUrl: debugCanvas.toDataURL(),
          hasChecked: results.some((r) => r.isChecked),
          error: null,
        });
      } catch (debugError) {
        console.error("Debug canvas output error:", debugError);
      }
    }

    // Send checked squares to backend
    const checkedSquares = results.filter((r) => r.isChecked);

    if (checkedSquares.length > 0 && qrId) {
      try {
        const apiPayload = checkedSquares.map((r) => ({
          number: r.number,
          title: r.title,
          fileType: r.fileType,
          confidence: r.confidence,
          fillPercentage: r.fillPercentage,
        }));

        await assignQR(qrId, apiPayload);
        toast.success(`✅ Detected ${checkedSquares.length} marked option(s)`, {
          id: "detection-success",
        });

        if (navigate) {
          navigate(`/result/${qrId}`);
        }
      } catch (assignError) {
        console.error("QR assignment failed:", assignError);
        toast.error(
          "Failed to assign QR: " +
            (assignError.response?.data?.message || assignError.message)
        );
      }
    } else if (setIsModalOpen) {
      setIsModalOpen(true);
    }

    // Memory Cleanup
    src.delete();
    warped.delete();
    debugMat.delete();

    return results;
  } catch (err) {
    const msg = err?.message || String(err);
    console.error("❌ Error running square detection:", msg);
    toast.error("Square detection error: " + msg);

    if (onDebug) {
      onDebug({
        error: msg,
        imageSize: { width: src.cols, height: src.rows },
        roi: getROI(),
        checkboxes: [],
      });
    }

    src.delete();
  }
};

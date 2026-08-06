import { assignQR } from "../service/api.service";
import { toast } from "react-hot-toast";

// ============ UTILITY FUNCTIONS ============

// Phase 1: Warp to fixed size
const warpImage = (cv, src, markers) => {
  if (markers.size() !== 4) {
    throw new Error(`Expected 4 markers, got ${markers.size()}`);
  }

  const points = [];
  for (let i = 0; i < markers.size(); i++) {
    const marker = markers.get(i);
    const corners = marker.getCorners();
    const center = new cv.Point(
      (corners[0].x + corners[1].x + corners[2].x + corners[3].x) / 4,
      (corners[0].y + corners[1].y + corners[2].y + corners[3].y) / 4,
    );
    points.push(center);
  }

  points.sort((a, b) => a.y - b.y);
  const top = points.slice(0, 2).sort((a, b) => a.x - b.x);
  const bottom = points.slice(2).sort((a, b) => a.x - b.x);
  const sortedPoints = [...top, ...bottom];

  const dstPoints = [
    new cv.Point(0, 0),
    new cv.Point(600, 0),
    new cv.Point(600, 1000),
    new cv.Point(0, 1000),
  ];

  const srcMat = cv.matFromArray(
    4,
    1,
    cv.CV_32FC2,
    sortedPoints.flatMap((p) => [p.x, p.y]),
  );
  const dstMat = cv.matFromArray(
    4,
    1,
    cv.CV_32FC2,
    dstPoints.flatMap((p) => [p.x, p.y]),
  );

  const transform = cv.getPerspectiveTransform(srcMat, dstMat);
  const warped = new cv.Mat();
  cv.warpPerspective(src, warped, transform, new cv.Size(600, 1000));

  srcMat.delete();
  dstMat.delete();
  transform.delete();

  return warped;
};

// Phase 2: Fixed ROI (pixels, not percentages)
const getROI = () => {
  // Adjusted to better capture the checkbox area
  return {
    x: 20, // Start a bit more to the left
    y: 280, // Start after the title
    width: 540, // Wider to capture full checkbox area
    height: 600, // Taller to capture all 3 checkboxes
  };
};

// Phase 4: Get checkbox strip - adjusted for better spacing
const getCheckboxStrip = (roi, index) => {
  const positions = [
    // Checkbox 1
    {
      x: roi.x,
      y: roi.y + 180, // <-- change this
      width: roi.width,
      height: 70, // <-- change this
    },

    // Checkbox 2
    {
      x: roi.x,
      y: roi.y + 320, // <-- change this
      width: roi.width,
      height: 70,
    },

    // Checkbox 3
    {
      x: roi.x,
      y: roi.y + 460, // <-- change this
      width: roi.width,
      height: 70,
    },
  ];

  return positions[index];
};
// Phase 5: Crop only the checkbox - ADJUST THIS FUNCTION
const getCheckboxCrop = (strip) => {
  // Size of checkbox crop
  const checkboxSize = 34;

  // Horizontal adjustment (move left/right)
  const leftPadding = 6;

  // Vertical adjustment as percentage of strip height
  // Try: 0.20, 0.22, 0.25 until it perfectly aligns
  const topPercentage = 0.32;

  return {
    x: strip.x + leftPadding,
    y: strip.y,
    width: checkboxSize,
    height: checkboxSize,
  };
};

// Phase 6: Analyze checkbox by counting pixels
const analyzeCheckbox = (cv, checkboxMat) => {
  // Convert to grayscale if needed
  let gray = checkboxMat;
  let needsCleanup = false;

  if (checkboxMat.channels() > 1) {
    gray = new cv.Mat();
    cv.cvtColor(checkboxMat, gray, cv.COLOR_RGBA2GRAY);
    needsCleanup = true;
  }

  // Apply threshold to get binary image
  const thresh = new cv.Mat();
  cv.threshold(gray, thresh, 127, 255, cv.THRESH_BINARY_INV);

  // Count black pixels (filled area)
  const totalPixels = thresh.rows * thresh.cols;
  const blackPixels = cv.countNonZero(thresh);
  const fillPercentage = (blackPixels / totalPixels) * 100;

  // Determine if checked
  // Empty checkbox: ~5-15% filled (border only)
  // Checked checkbox: ~25-65% filled (check mark inside)
  const isChecked = fillPercentage > 18 && fillPercentage < 75;

  // Calculate confidence
  let confidence = 0;
  if (isChecked) {
    // For checked: higher fill percentage = higher confidence (up to 65%)
    confidence = Math.min(100, (fillPercentage / 50) * 100);
  } else {
    // For empty: lower fill percentage = higher confidence (down to 5%)
    confidence = Math.max(0, 100 - (fillPercentage / 20) * 100);
  }

  // Cleanup
  if (needsCleanup) {
    gray.delete();
  }
  thresh.delete();

  return {
    isChecked,
    confidence: Math.round(Math.min(Math.max(confidence, 0), 100)),
    fillPercentage: Math.round(fillPercentage),
    blackPixels,
    totalPixels,
  };
};

// Phase 8: Validate document
const validateDocument = (cv, warped, markerIds) => {
  const validation = {
    passed: true,
    checks: [],
    errors: [],
  };

  validation.checks.push({
    name: "ArUco markers",
    passed: markerIds.length === 4,
    details: `Found ${markerIds.length} markers: ${markerIds.join(", ")}`,
  });

  if (markerIds.length !== 4) {
    validation.passed = false;
    validation.errors.push(`Expected 4 markers, found ${markerIds.length}`);
  }

  const aspectRatio = warped.cols / warped.rows;
  const expectedRatio = 600 / 1000;
  const ratioTolerance = 0.1;
  const aspectValid = Math.abs(aspectRatio - expectedRatio) < ratioTolerance;
  validation.checks.push({
    name: "Aspect ratio",
    passed: aspectValid,
    details: `Ratio: ${aspectRatio.toFixed(3)}, Expected: ${expectedRatio.toFixed(3)}`,
  });

  if (!aspectValid) {
    validation.passed = false;
    validation.errors.push("Incorrect aspect ratio");
  }

  return validation;
};

// ============ MAIN DETECTION FUNCTION ============

export const detectSquares = async ({
  cv,
  imgRef,
  qrId,
  detectionParams = {},
  roiParams = {},
  squareContent,
  navigate,
  setIsModalOpen,
  onDebug,
}) => {
  if (!cv || !imgRef?.current) return;

  const img = imgRef.current;
  const src = cv.imread(img);

  if (src.empty()) {
    console.error("❌ Failed to read image");
    return;
  }

  const gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

  try {
    console.log("📐 Original image dimensions:", gray.cols, gray.rows);

    // ============ PHASE 1: ArUco Detection & Warp ============
    let warped;
    let markerIds = [];

    try {
      const dictionary = cv.getPredefinedDictionary(cv.DICT_ARUCO_ORIGINAL);
      const markers = new cv.MatVector();
      const ids = new cv.Mat();

      if (cv.aruco && cv.aruco.detectMarkers) {
        cv.aruco.detectMarkers(gray, dictionary, markers, ids);
        markerIds = ids.data32S ? Array.from(ids.data32S) : [];
        console.log("🔍 Detected ArUco markers:", markerIds);

        if (markers.size() === 4) {
          warped = warpImage(cv, src, markers);
          console.log("✅ Warped image to 600x1000");
        } else {
          throw new Error(`Expected 4 markers, found ${markers.size()}`);
        }
      } else {
        throw new Error("ArUco not available in this OpenCV build");
      }

      markers.delete();
      ids.delete();
      dictionary.delete();
    } catch (arucoError) {
      console.error("❌ ArUco detection/warp failed:", arucoError);
      warped = new cv.Mat();
      cv.resize(src, warped, new cv.Size(600, 1000));
      console.log("⚠️ Using fallback: resized original image");
    }

    // ============ PHASE 2: Get Fixed ROI ============
    const roi = getROI();
    console.log("📐 Using fixed ROI:", roi);

    const roiX = Math.min(Math.round(roi.x), warped.cols - 1);
    const roiY = Math.min(Math.round(roi.y), warped.rows - 1);
    const roiWidth = Math.min(Math.round(roi.width), warped.cols - roiX);
    const roiHeight = Math.min(Math.round(roi.height), warped.rows - roiY);

    const roiMat = warped.roi(new cv.Rect(roiX, roiY, roiWidth, roiHeight));

    // ============ PHASE 3: Debug Rectangle ============
    const debugMat = warped.clone();
    const pt1 = new cv.Point(roiX, roiY);
    const pt2 = new cv.Point(roiX + roiWidth, roiY + roiHeight);
    cv.rectangle(debugMat, pt1, pt2, new cv.Scalar(0, 255, 0), 2);

    // ============ PHASE 8: Document Validation ============
    const validation = validateDocument(cv, warped, markerIds);
    console.log("📋 Validation:", validation);

    // ============ PHASE 4-6: Process Checkboxes ============
    const totalCheckboxes = 3;
    const results = [];
    const debugInfo = {
      imageSize: { width: src.cols, height: src.rows },
      warpedSize: { width: warped.cols, height: warped.rows },
      roi: { x: roiX, y: roiY, width: roiWidth, height: roiHeight },
      checkboxes: [],
      markerIds: markerIds,
      validation: validation,
    };

    for (let i = 0; i < totalCheckboxes; i++) {
      // Phase 4: Get checkbox strip
      const strip = getCheckboxStrip(
        { x: roiX, y: roiY, width: roiWidth, height: roiHeight },
        i,
        totalCheckboxes,
      );

      // Phase 5: Crop only the checkbox
      const checkboxCrop = getCheckboxCrop(strip);

      // Ensure crop is within bounds
      const cropX = Math.min(Math.round(checkboxCrop.x), warped.cols - 1);
      const cropY = Math.min(Math.round(checkboxCrop.y), warped.rows - 1);
      const cropWidth = Math.min(
        Math.round(checkboxCrop.width),
        warped.cols - cropX,
      );
      const cropHeight = Math.min(
        Math.round(checkboxCrop.height),
        warped.rows - cropY,
      );

      if (cropWidth > 0 && cropHeight > 0) {
        const checkboxMat = warped.roi(
          new cv.Rect(cropX, cropY, cropWidth, cropHeight),
        );

        // Phase 6: Analyze checkbox
        const analysis = analyzeCheckbox(cv, checkboxMat);

        // Draw on debug image
        const color = analysis.isChecked ? [0, 255, 0] : [255, 0, 0];
        const dbPt1 = new cv.Point(cropX, cropY);
        const dbPt2 = new cv.Point(cropX + cropWidth, cropY + cropHeight);
        cv.rectangle(
          debugMat,
          dbPt1,
          dbPt2,
          new cv.Scalar(color[0], color[1], color[2]),
          3,
        );

        // Add label to the right
        const label = `${i + 1}: ${analysis.isChecked ? "✓" : "○"} ${analysis.confidence}%`;
        const font = cv.FONT_HERSHEY_SIMPLEX;
        const point = new cv.Point(
          cropX + cropWidth + 8,
          cropY + cropHeight / 2 + 4,
        );
        cv.putText(
          debugMat,
          label,
          point,
          font,
          0.4,
          new cv.Scalar(255, 255, 0),
          1,
        );

        const result = {
          number: i + 1,
          title: squareContent[i + 1]?.title || `Checkbox ${i + 1}`,
          fileType: squareContent[i + 1]?.fileType || "mp4",
          ...analysis,
          crop: { x: cropX, y: cropY, width: cropWidth, height: cropHeight },
        };
        results.push(result);

        debugInfo.checkboxes.push({
          index: i + 1,
          ...analysis,
          crop: { x: cropX, y: cropY, width: cropWidth, height: cropHeight },
        });

        checkboxMat.delete();
      } else {
        console.warn(`⚠️ Checkbox ${i + 1} crop has invalid dimensions`);
        results.push({
          number: i + 1,
          title: squareContent[i + 1]?.title || `Checkbox ${i + 1}`,
          fileType: squareContent[i + 1]?.fileType || "mp4",
          isChecked: false,
          confidence: 0,
          fillPercentage: 0,
          blackPixels: 0,
          totalPixels: 0,
        });
      }
    }

    // ============ PHASE 7: Debug Output ============
    if (onDebug) {
      try {
        const debugCanvas = document.createElement("canvas");
        cv.imshow(debugCanvas, debugMat);

        const roiGray = new cv.Mat();
        cv.cvtColor(roiMat, roiGray, cv.COLOR_RGBA2GRAY);
        const roiThresh = new cv.Mat();
        cv.threshold(roiGray, roiThresh, 127, 255, cv.THRESH_BINARY_INV);
        const threshCanvas = document.createElement("canvas");
        cv.imshow(threshCanvas, roiThresh);
        roiGray.delete();
        roiThresh.delete();

        onDebug({
          ...debugInfo,
          fullImageUrl: debugCanvas.toDataURL(),
          roiThresholdUrl: threshCanvas.toDataURL(),
          hasChecked: results.some((r) => r.isChecked),
          overallConfidence:
            results.length > 0
              ? Math.round(
                  results.reduce((sum, r) => sum + r.confidence, 0) /
                    results.length,
                )
              : 0,
          error: null,
        });
      } catch (debugError) {
        console.error("Debug output error:", debugError);
      }
    }

    // ============ PHASE 10: Send Results ============
    const checkedSquares = results.filter((r) => r.isChecked);
    console.log("📦 Checked squares:", checkedSquares);

    if (checkedSquares.length > 0 && qrId) {
      try {
        const apiResults = checkedSquares.map((r) => ({
          number: r.number,
          title: r.title,
          fileType: r.fileType,
          confidence: r.confidence,
          fillPercentage: r.fillPercentage,
        }));

        await assignQR(qrId, apiResults);
        toast.success(`✅ Found ${checkedSquares.length} checked box(es)`, {
          id: "success",
        });

        if (navigate) {
          navigate(`/result/${qrId}`);
        }
      } catch (error) {
        console.error("Assignment error:", error);
        toast.error(
          "Unable to process the QR: " +
            (error.response?.data?.message || error.message),
        );
      }
    } else {
      console.warn("⚠️ No checked squares detected");
      if (setIsModalOpen) {
        setIsModalOpen(true);
      }
    }

    // ============ CLEANUP ============
    src.delete();
    gray.delete();
    warped.delete();
    roiMat.delete();
    debugMat.delete();

    return results;
  } catch (error) {
    const message = error?.message || String(error);
    console.error("❌ Error in square detection:", message);
    toast.error("Error detecting squares: " + message);

    if (onDebug) {
      onDebug({
        error: message,
        imageSize: { width: src.cols, height: src.rows },
        roi: getROI(),
        checkboxes: [],
      });
    }

    src.delete();
    gray.delete();
  }
};

import axios from "axios";
import { toast } from "react-hot-toast";

const getSquareNumber = (y, roiY) => {
  // Calculate relative Y position within ROI
  const relativeY = y - roiY;

  // More flexible detection based on relative positions
  // Assuming squares are roughly evenly spaced
  const ranges = [
    { min: 0, max: 120, number: 1 },
    { min: 120, max: 240, number: 2 },
    { min: 240, max: 360, number: 3 },
  ];

  const foundRange = ranges.find(
    (range) => relativeY >= range.min && relativeY <= range.max,
  );

  return foundRange ? foundRange.number : null;
};

export const detectSquares = async ({
  cv,
  imgRef,
  qrId,
  detectionParams,
  roiParams,
  squareContent,
  navigate,
  setIsModalOpen,
}) => {
  if (!cv || !imgRef?.current) return;

  const img = imgRef.current;
  const src = cv.imread(img);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const thresh = new cv.Mat();
  const morphed = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  try {
    // Convert to grayscale
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Debug: Save and log image dimensions
    console.log("📐 Original image dimensions:", gray.cols, gray.rows);

    // Calculate ROI with safety checks
    const roi = {
      x: Math.round(roiParams.xPct * gray.cols),
      y: Math.round(roiParams.yPct * gray.rows),
      width: Math.round(roiParams.widthPct * gray.cols),
      height: Math.round(roiParams.heightPct * gray.rows),
    };

    console.log("📐 ROI before clamp:", roi);
    console.log("📐 ROI parameters used:", roiParams);

    // Validate ROI
    if (roi.x < 0 || roi.y < 0 || roi.x >= gray.cols || roi.y >= gray.rows) {
      console.error(
        `❌ ROI origin (${roi.x}, ${roi.y}) is outside image bounds`,
      );
      return;
    }

    // Clamp ROI to image boundaries
    const maxWidth = gray.cols - roi.x;
    const maxHeight = gray.rows - roi.y;
    roi.width = Math.min(roi.width, maxWidth);
    roi.height = Math.min(roi.height, maxHeight);

    if (roi.width <= 0 || roi.height <= 0) {
      console.error(`❌ ROI has invalid dimensions: ${JSON.stringify(roi)}`);
      return;
    }

    console.log("📐 ROI after clamp:", roi);

    // Check if ROI is too small
    if (roi.width < 50 || roi.height < 50) {
      console.warn(
        `⚠️ ROI dimensions (${roi.width}x${roi.height}) might be too small for detection`,
      );
    }

    // Extract ROI
    const roiRect = new cv.Rect(roi.x, roi.y, roi.width, roi.height);
    const roiGray = gray.roi(roiRect);

    // === IMPROVED PREPROCESSING ===

    // 1. Enhance contrast using CLAHE
    const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
    const enhanced = new cv.Mat();
    clahe.apply(roiGray, enhanced);
    clahe.delete();

    // 2. Gaussian blur to reduce noise
    const roiBlurred = new cv.Mat();
    cv.GaussianBlur(enhanced, roiBlurred, new cv.Size(5, 5), 0);
    enhanced.delete();

    // 3. Adaptive threshold with more sensitive parameters
    const roiThresh = new cv.Mat();
    const blockSize = detectionParams?.blockSize || 11;
    const C = detectionParams?.C || 2;

    cv.adaptiveThreshold(
      roiBlurred,
      roiThresh,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      blockSize,
      C,
    );

    // 4. Morphological operations with proper kernel size
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    const roiMorphed = new cv.Mat();
    cv.morphologyEx(roiThresh, roiMorphed, cv.MORPH_CLOSE, kernel);
    cv.morphologyEx(roiMorphed, roiMorphed, cv.MORPH_OPEN, kernel);

    // REMOVED: cv.imshow('threshold_output', roiMorphed) - This was causing the error

    // Find contours
    cv.findContours(
      roiMorphed,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE,
    );

    console.log(`🔍 Found ${contours.size()} contours in ROI`);

    const foundSquares = [];

    for (let i = 0; i < contours.size(); ++i) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);

      // More flexible area constraints
      const minArea = detectionParams?.minArea || 50;
      const maxArea = detectionParams?.maxArea || 5000;

      if (area < minArea || area > maxArea) {
        cnt.delete();
        continue;
      }

      // Approximate contour
      const approx = new cv.Mat();
      const perimeter = cv.arcLength(cnt, true);
      const epsilon = 0.02 * perimeter;
      cv.approxPolyDP(cnt, approx, epsilon, true);

      // Check if it has 4 vertices (quadrilateral)
      if (approx.rows === 4) {
        const rect = cv.boundingRect(cnt);

        // Calculate aspect ratio
        const aspectRatio = rect.width / rect.height;

        // More tolerant square detection (0.7 to 1.3 ratio)
        const isSquarish = aspectRatio > 0.7 && aspectRatio < 1.3;

        // Size check - adjusted for small ROI
        const minSize = 10;
        const maxSize = 150;

        if (
          isSquarish &&
          rect.width > minSize &&
          rect.width < maxSize &&
          rect.height > minSize &&
          rect.height < maxSize
        ) {
          // Calculate convexity
          const hull = new cv.Mat();
          cv.convexHull(cnt, hull);
          const hullArea = cv.contourArea(hull);
          const convexityRatio = hullArea > 0 ? area / hullArea : 0;

          // More tolerant convexity threshold
          if (convexityRatio > 0.5) {
            // Get square number based on Y position relative to ROI
            const squareNumber = getSquareNumber(rect.y, roi.y);

            // Debug output
            console.log(
              `✅ Potential square detected at (${rect.x}, ${rect.y}) size: ${rect.width}x${rect.height}, area: ${area}`,
            );

            if (squareNumber) {
              foundSquares.push({
                x: rect.x + roi.x,
                y: rect.y + roi.y,
                width: rect.width,
                height: rect.height,
                area,
                number: squareNumber,
                status: "found",
                aspectRatio: aspectRatio,
                convexityRatio: convexityRatio,
              });
            }
          }
          hull.delete();
        }
      }

      approx.delete();
      cnt.delete();
    }

    // Sort found squares by Y position and remove duplicates
    foundSquares.sort((a, b) => a.y - b.y);

    // Remove duplicate squares (same number)
    const uniqueSquares = [];
    const seenNumbers = new Set();
    for (const square of foundSquares) {
      if (!seenNumbers.has(square.number)) {
        seenNumbers.add(square.number);
        uniqueSquares.push(square);
      }
    }

    console.log(
      `✅ Found ${uniqueSquares.length} valid squares:`,
      uniqueSquares.map((s) => s.number),
    );

    // Create final results
    const allSquares = Array.from({ length: 3 }, (_, i) => {
      const squareNumber = i + 1;
      const foundSquare = uniqueSquares.find(
        (sq) => sq.number === squareNumber,
      );

      return (
        foundSquare || {
          x: null,
          y: null,
          width: null,
          height: null,
          area: null,
          number: squareNumber,
          status: "notFound",
        }
      );
    });

    // Process checked squares
    const checkedSquares = [];
    allSquares.forEach((square) => {
      if (square.status === "found") {
        const content = squareContent[square.number] || {};
        checkedSquares.push({
          number: square.number,
          title: content.title || `Square ${square.number}`,
          fileType: content.fileType,
        });
      }
    });

    console.log("📦 Checked squares to assign:", checkedSquares);

    // Update QR or show modal
    if (checkedSquares.length > 0) {
      try {
        await axios.patch(
          `${import.meta.env.VITE_API_URL}/qr/assign/${qrId}`,
          checkedSquares,
        );
        toast.success(
          `Found ${checkedSquares.length} square(s) - QR assigned successfully`,
          {
            id: "success",
          },
        );
        navigate(`/result/${qrId}`);
      } catch (error) {
        console.error("Assignment error:", error);
        toast.error("Unable to process the QR");
      }
    } else {
      console.warn("⚠️ No squares detected");
      setIsModalOpen(true);
    }

    // Cleanup ROI Mats
    roiGray.delete();
    roiBlurred.delete();
    roiThresh.delete();
    roiMorphed.delete();
    kernel.delete();
  } catch (error) {
    const message =
      typeof error === "number" && cv.exceptionFromPtr
        ? cv.exceptionFromPtr(error).msg
        : error?.message || error;
    console.error("Error in square detection:", message);
    toast.error("Error detecting squares");
  } finally {
    // Cleanup
    src.delete();
    gray.delete();
    blurred.delete();
    thresh.delete();
    morphed.delete();
    contours.delete();
    hierarchy.delete();
  }
};

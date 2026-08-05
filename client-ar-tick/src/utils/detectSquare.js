import { assignQR } from "../service/api.service";
import { toast } from "react-hot-toast";

const getSquareNumber = (y, roiHeight) => {
  if (y < 0 || y > roiHeight) return null;

  const third = roiHeight / 3;
  if (y < third) return 1;
  if (y < third * 2) return 2;
  return 3;
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
  onDebug, // NEW: optional callback, receives everything needed to SEE what's happening
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
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    console.log("📐 Original image dimensions:", gray.cols, gray.rows);

    const roi = {
      x: Math.round(roiParams.xPct * gray.cols),
      y: Math.round(roiParams.yPct * gray.rows),
      width: Math.round(roiParams.widthPct * gray.cols),
      height: Math.round(roiParams.heightPct * gray.rows),
    };

    console.log("📐 ROI before clamp:", roi);
    console.log("📐 ROI parameters used:", roiParams);

    if (roi.x < 0 || roi.y < 0 || roi.x >= gray.cols || roi.y >= gray.rows) {
      console.error(
        `❌ ROI origin (${roi.x}, ${roi.y}) is outside image bounds`,
      );
      if (onDebug) {
        onDebug({
          fullImageUrl: img.src,
          roiThresholdUrl: null,
          roi,
          imageSize: { width: gray.cols, height: gray.rows },
          error: `ROI origin (${roi.x}, ${roi.y}) is outside image bounds (${gray.cols}x${gray.rows})`,
        });
      }
      return;
    }

    const maxWidth = gray.cols - roi.x;
    const maxHeight = gray.rows - roi.y;
    roi.width = Math.min(roi.width, maxWidth);
    roi.height = Math.min(roi.height, maxHeight);

    if (roi.width <= 0 || roi.height <= 0) {
      console.error(`❌ ROI has invalid dimensions: ${JSON.stringify(roi)}`);
      return;
    }

    console.log("📐 ROI after clamp:", roi);

    const roiRect = new cv.Rect(roi.x, roi.y, roi.width, roi.height);
    const roiGray = gray.roi(roiRect);

    const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
    const enhanced = new cv.Mat();
    clahe.apply(roiGray, enhanced);
    clahe.delete();

    const roiBlurred = new cv.Mat();
    cv.GaussianBlur(enhanced, roiBlurred, new cv.Size(5, 5), 0);
    enhanced.delete();

    const roiThresh = new cv.Mat();
    const blockSize = detectionParams?.blockSize || 11;
    const C = detectionParams?.C || 2;
    const epsilonFactor = detectionParams?.epsilonFactor || 0.02;

    cv.adaptiveThreshold(
      roiBlurred,
      roiThresh,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      blockSize,
      C,
    );

    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    const roiMorphed = new cv.Mat();
    cv.morphologyEx(roiThresh, roiMorphed, cv.MORPH_CLOSE, kernel);
    cv.morphologyEx(roiMorphed, roiMorphed, cv.MORPH_OPEN, kernel);

    const detectSquaresFromMat = (mat, roiHeight) => {
      const localContours = new cv.MatVector();
      const localHierarchy = new cv.Mat();
      cv.findContours(
        mat,
        localContours,
        localHierarchy,
        cv.RETR_EXTERNAL,
        cv.CHAIN_APPROX_SIMPLE,
      );

      console.log(`🔍 Found ${localContours.size()} contours in ROI`);
      const squares = [];

      for (let i = 0; i < localContours.size(); ++i) {
        const cnt = localContours.get(i);
        const area = cv.contourArea(cnt);

        const minArea = detectionParams?.minArea || 50;
        const maxArea = detectionParams?.maxArea || 5000;

        if (area < minArea || area > maxArea) {
          cnt.delete();
          continue;
        }

        const approx = new cv.Mat();
        const perimeter = cv.arcLength(cnt, true);
        const epsilon = epsilonFactor * perimeter;
        cv.approxPolyDP(cnt, approx, epsilon, true);

        if (approx.rows === 4) {
          const rect = cv.boundingRect(cnt);
          const aspectRatio = rect.width / rect.height;
          const isSquarish = aspectRatio > 0.7 && aspectRatio < 1.3;

          const minSize = 10;
          const maxSize = 150;

          if (
            isSquarish &&
            rect.width > minSize &&
            rect.width < maxSize &&
            rect.height > minSize &&
            rect.height < maxSize
          ) {
            const hull = new cv.Mat();
            cv.convexHull(cnt, hull);
            const hullArea = cv.contourArea(hull);
            const convexityRatio = hullArea > 0 ? area / hullArea : 0;

            if (convexityRatio > 0.5) {
              const squareNumber = getSquareNumber(rect.y, roiHeight);

              console.log(
                `✅ Potential square detected at (${rect.x}, ${rect.y}) size: ${rect.width}x${rect.height}, area: ${area}`,
              );

              if (squareNumber) {
                squares.push({
                  x: rect.x + roi.x,
                  y: rect.y + roi.y,
                  width: rect.width,
                  height: rect.height,
                  area,
                  number: squareNumber,
                  status: "found",
                  aspectRatio,
                  convexityRatio,
                });
              }
            }
            hull.delete();
          }
        }

        approx.delete();
        cnt.delete();
      }

      localHierarchy.delete();
      localContours.delete();
      return squares;
    };

    if (onDebug) {
      const debugCanvas = document.createElement("canvas");
      cv.imshow(debugCanvas, roiMorphed);
      onDebug({
        fullImageUrl: img.src, // the full warped/cropped card, as actually processed
        roiThresholdUrl: debugCanvas.toDataURL(), // just the ROI slice, post-threshold
        roi,
        imageSize: { width: gray.cols, height: gray.rows },
        error: null,
      });
    }

    let foundSquares = detectSquaresFromMat(roiMorphed, roi.height);

    if (foundSquares.length === 0 && roi.width < gray.cols) {
      console.warn(
        "⚠️ No valid squares found in initial ROI, scanning lower half full width.",
      );
      const expandedRoi = {
        x: 0,
        y: roi.y,
        width: gray.cols,
        height: roi.height,
      };
      const expandedRect = new cv.Rect(
        expandedRoi.x,
        expandedRoi.y,
        expandedRoi.width,
        expandedRoi.height,
      );
      const expandedGray = gray.roi(expandedRect);
      const expandedBlurred = new cv.Mat();
      const expandedThresh = new cv.Mat();
      const expandedMorphed = new cv.Mat();

      cv.GaussianBlur(expandedGray, expandedBlurred, new cv.Size(5, 5), 0);
      cv.adaptiveThreshold(
        expandedBlurred,
        expandedThresh,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY_INV,
        blockSize,
        C,
      );
      const expandedKernel = cv.getStructuringElement(
        cv.MORPH_RECT,
        new cv.Size(3, 3),
      );
      cv.morphologyEx(
        expandedThresh,
        expandedMorphed,
        cv.MORPH_CLOSE,
        expandedKernel,
      );
      cv.morphologyEx(
        expandedMorphed,
        expandedMorphed,
        cv.MORPH_OPEN,
        expandedKernel,
      );

      if (onDebug) {
        const debugCanvas = document.createElement("canvas");
        cv.imshow(debugCanvas, expandedMorphed);
        onDebug((prev) => ({
          ...prev,
          fallbackRoi: expandedRoi,
          fallbackThresholdUrl: debugCanvas.toDataURL(),
        }));
      }

      foundSquares = detectSquaresFromMat(expandedMorphed, expandedRoi.height);

      expandedGray.delete();
      expandedBlurred.delete();
      expandedThresh.delete();
      expandedMorphed.delete();
      expandedKernel.delete();
    }

    foundSquares.sort((a, b) => a.y - b.y);

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

    if (checkedSquares.length > 0) {
      try {
        await assignQR(qrId, checkedSquares);
        toast.success(
          `Found ${checkedSquares.length} square(s) - QR assigned successfully`,
          { id: "success" },
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
    src.delete();
    gray.delete();
    blurred.delete();
    thresh.delete();
    morphed.delete();
    contours.delete();
    hierarchy.delete();
  }
};

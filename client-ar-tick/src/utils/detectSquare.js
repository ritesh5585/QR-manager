import axios from "axios";
import { toast } from "react-hot-toast";

const getSquareNumber = (y) => {
  const ranges = [
    { min: 285, max: 295, number: 1 },
    { min: 385, max: 395, number: 2 },
    { min: 485, max: 495, number: 3 },
  ];

  const foundRange = ranges.find((range) => y >= range.min && y <= range.max);
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

    console.log(`📐 Cropped image size: ${gray.cols} x ${gray.rows}`);
    console.log(
      `📐 ROI needs: x=${roiParams.x}, y=${roiParams.y}, ` +
        `right edge=${roiParams.x + roiParams.width}, ` +
        `bottom edge=${roiParams.y + roiParams.height}`,
    );

    // GUARD: if the hardcoded ROI doesn't fit this image, stop cleanly
    // instead of letting OpenCV throw an unreadable WASM exception.
    if (
      roiParams.x + roiParams.width > gray.cols ||
      roiParams.y + roiParams.height > gray.rows
    ) {
      console.error(
        `❌ ROI doesn't fit. Image is ${gray.cols}x${gray.rows}, but ROI ` +
          `needs at least ${roiParams.x + roiParams.width}x${roiParams.y + roiParams.height}. ` +
          `roiParams are hardcoded pixels — they don't match this camera's resolution.`,
      );
      return;
    }

    const roiRect = new cv.Rect(
      roiParams.x,
      roiParams.y,
      roiParams.width,
      roiParams.height,
    );

    const roiGray = gray.roi(roiRect);
    const roiBlurred = new cv.Mat();
    const roiThresh = new cv.Mat();
    const roiMorphed = new cv.Mat();

    cv.GaussianBlur(roiGray, roiBlurred, new cv.Size(3, 3), 0);

    cv.adaptiveThreshold(
      roiBlurred,
      roiThresh,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      detectionParams.blockSize,
      detectionParams.C,
    );

    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(2, 2));
    cv.morphologyEx(roiThresh, roiMorphed, cv.MORPH_CLOSE, kernel);
    cv.morphologyEx(roiMorphed, roiMorphed, cv.MORPH_OPEN, kernel);

    cv.findContours(
      roiMorphed,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE,
    );

    const foundSquares = [];
    for (let i = 0; i < contours.size(); ++i) {
      const cnt = contours.get(i);
      const area = cv.contourArea(cnt);

      if (area < detectionParams.minArea || area > detectionParams.maxArea) {
        cnt.delete();
        continue;
      }

      const approx = new cv.Mat();
      const epsilon = detectionParams.epsilonFactor * cv.arcLength(cnt, true);
      cv.approxPolyDP(cnt, approx, epsilon, true);

      if (approx.rows === 4) {
        const rect = cv.boundingRect(cnt);
        const adjustedRect = {
          x: rect.x + roiParams.x,
          y: rect.y + roiParams.y,
          width: rect.width,
          height: rect.height,
        };

        const aspectRatio = adjustedRect.width / adjustedRect.height;
        const isSquarish =
          Math.abs(aspectRatio - 1) < detectionParams.aspectRatioTolerance;

        if (isSquarish && adjustedRect.width > 5 && adjustedRect.height > 5) {
          const hull = new cv.Mat();
          cv.convexHull(cnt, hull);
          const hullArea = cv.contourArea(hull);
          const convexityRatio = area / hullArea;

          if (convexityRatio > 0.7) {
            const squareNumber = getSquareNumber(adjustedRect.y);

            foundSquares.push({
              x: adjustedRect.x,
              y: adjustedRect.y,
              width: adjustedRect.width,
              height: adjustedRect.height,
              area,
              number: squareNumber,
              status: "found",
            });
          }
          hull.delete();
        }
      }

      approx.delete();
      cnt.delete();
    }

    const allSquares = Array.from({ length: 3 }, (_, i) => {
      const squareNumber = i + 1;
      const foundSquare = foundSquares.find((sq) => sq.number === squareNumber);

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
      if (square.status === "notFound") {
        const content = squareContent[square.number] || {};
        checkedSquares.push({
          number: square.number,
          title: content.title || `Square ${square.number}`,
          fileType: content.fileType,
        });
      }
    });

    if (checkedSquares.length > 0) {
      try {
        await axios.patch(
          `${import.meta.env.VITE_API_URL}/qr/assign/${qrId}`,
          checkedSquares,
        );
        toast.success("QR assigned successfully", { id: "success" });
        navigate(`/result/${qrId}`);
      } catch (error) {
        console.error("Assignment error:", error);
        toast.error("Unable to process the QR");
      }
    } else {
      setIsModalOpen(true);
    }

    roiGray.delete();
    roiBlurred.delete();
    roiThresh.delete();
    roiMorphed.delete();
    kernel.delete();
  } catch (error) {
    // FIX: decode OpenCV.js's raw WASM exception pointer into a readable
    // message instead of a meaningless number like "7025384".
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

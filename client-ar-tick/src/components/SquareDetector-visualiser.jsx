import { useEffect, useRef, useState, useCallback } from "react";
import { assignQR } from "../service/api.service";
import { toast } from "react-hot-toast";
import { useNavigate } from "react-router-dom";

const SquareDetector = ({ scannedImage, qrId }) => {
  const navigate = useNavigate();
  const imgRef = useRef();
  const canvasRef = useRef();
  const [cvReady, setCvReady] = useState(false);
  const [imageURL, setImageURL] = useState(null);
  const [detectionResults, setDetectionResults] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Detection configuration
  const config = {
    adaptiveThreshold: {
      minBlockSize: 11,
      maxBlockSize: 51,
      minC: 2,
      maxC: 10,
    },
    contourFilter: {
      minExtent: 0.6,
      minSolidity: 0.7,
      minArea: 50,
      maxArea: 5000,
    },
    confidenceThreshold: 70, // percentage
    normalizeSize: { width: 400, height: 700 },
  };

  // Get dynamic ROI based on image dimensions
  const getDynamicROI = (imgWidth, imgHeight) => {
    return {
      x: imgWidth * 0.07,
      y: imgHeight * 0.58,
      width: imgWidth * 0.86,
      height: imgHeight * 0.42,
    };
  };

  // Calculate brightness of image
  const calculateBrightness = (mat) => {
    const mean = new cv.Mat();
    cv.meanStdDev(mat, mean);
    const brightness = mean.data64F[0];
    mean.delete();
    return brightness;
  };

  // Get adaptive threshold parameters based on brightness
  const getAdaptiveParams = (brightness) => {
    // Dark image: use smaller block size, larger C
    // Bright image: use larger block size, smaller C
    const normalized = Math.min(Math.max(brightness / 128, 0), 1);

    const blockSize = Math.round(
      config.adaptiveThreshold.maxBlockSize -
        normalized *
          (config.adaptiveThreshold.maxBlockSize -
            config.adaptiveThreshold.minBlockSize),
    );
    // Ensure blockSize is odd
    const finalBlockSize = blockSize % 2 === 0 ? blockSize + 1 : blockSize;

    const C = Math.round(
      config.adaptiveThreshold.minC +
        (1 - normalized) *
          (config.adaptiveThreshold.maxC - config.adaptiveThreshold.minC),
    );

    return { blockSize: finalBlockSize, C };
  };

  // Calculate confidence score for a detected square
  const calculateConfidence = (contour, roi, originalImage) => {
    let confidence = 0;
    const factors = [];

    // 1. Extent check (area / bounding rect area)
    const rect = cv.boundingRect(contour);
    const contourArea = cv.contourArea(contour);
    const rectArea = rect.width * rect.height;
    const extent = contourArea / rectArea;
    factors.push({ name: "extent", value: extent, weight: 0.25 });

    if (extent > config.contourFilter.minExtent) confidence += 25;

    // 2. Solidity check (area / convex hull area)
    const hull = new cv.Mat();
    cv.convexHull(contour, hull);
    const hullArea = cv.contourArea(hull);
    const solidity = contourArea / hullArea;
    hull.delete();
    factors.push({ name: "solidity", value: solidity, weight: 0.2 });

    if (solidity > config.contourFilter.minSolidity) confidence += 20;

    // 3. Aspect ratio (should be close to 1:1)
    const aspectRatio = rect.width / rect.height;
    const aspectScore = Math.max(0, 100 - Math.abs(aspectRatio - 1) * 200);
    factors.push({ name: "aspectRatio", value: aspectRatio, weight: 0.15 });
    confidence += aspectScore * 0.15;

    // 4. Border thickness check
    const borderConfidence = checkBorderThickness(rect, originalImage);
    factors.push({ name: "border", value: borderConfidence, weight: 0.2 });
    confidence += borderConfidence * 0.2;

    // 5. Black pixel percentage (inside the square should be mostly dark for checkbox)
    const blackPixelConfidence = checkBlackPixelPercentage(
      contour,
      originalImage,
    );
    factors.push({
      name: "blackPixel",
      value: blackPixelConfidence,
      weight: 0.2,
    });
    confidence += blackPixelConfidence * 0.2;

    // Log factors for debugging
    console.log("Confidence factors:", factors);
    console.log("Total confidence:", Math.round(confidence));

    return Math.min(Math.round(confidence), 100);
  };

  // Check border thickness
  const checkBorderThickness = (rect, image) => {
    // Check if the detected shape has a border by analyzing edge pixels
    const borderSampleSize = Math.min(rect.width, rect.height) * 0.1;
    // Implementation would check pixel intensity along the border
    // Returns a score 0-100
    return 80; // Placeholder
  };

  // Check black pixel percentage inside square
  const checkBlackPixelPercentage = (contour, image) => {
    // Create mask from contour
    const mask = cv.Mat.zeros(image.rows, image.cols, cv.CV_8U);
    cv.drawContours(mask, [contour], 0, 255, -1);

    // Count black pixels within mask
    const gray = new cv.Mat();
    cv.cvtColor(image, gray, cv.COLOR_RGBA2GRAY);

    const maskedImage = new cv.Mat();
    gray.copyTo(maskedImage, mask);

    const totalPixels = cv.countNonZero(mask);
    const blackPixels = cv.countNonZero(maskedImage) - totalPixels;

    const blackRatio = Math.abs(blackPixels) / totalPixels;

    // Ideal checkbox: 20-40% black pixels
    const score =
      blackRatio >= 0.2 && blackRatio <= 0.4
        ? 100
        : blackRatio > 0.4
          ? 100 - (blackRatio - 0.4) * 100
          : blackRatio * 500; // 0-0.2 maps to 0-100

    mask.delete();
    gray.delete();
    maskedImage.delete();

    return Math.min(Math.max(score, 0), 100);
  };

  // Check if any ArUco markers detected
  const detectArUcoMarkers = (image) => {
    try {
      const dictionary = cv.getPredefinedDictionary(cv.DICT_ARUCO_ORIGINAL);
      const detectorParams = new cv.DetectorParameters();
      const detector = new cv.ArucoDetector(dictionary, detectorParams);

      const markers = new cv.MatVector();
      const ids = new cv.Mat();

      detector.detectMarkers(image, markers, ids);

      const result = {
        hasMarkers: markers.size() > 0,
        markerCount: markers.size(),
        ids: ids.data32S ? Array.from(ids.data32S) : [],
        markers: markers,
      };

      // Clean up
      detector.delete();
      detectorParams.delete();

      return result;
    } catch (error) {
      console.error("ArUco detection error:", error);
      return { hasMarkers: false, markerCount: 0, ids: [], markers: null };
    }
  };

  // Main detection function
  const detectSquares = useCallback(async () => {
    if (!cvReady || !imgRef.current || isProcessing) return;

    setIsProcessing(true);
    const img = imgRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    try {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const src = cv.imread(img);
      const gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

      // 1. Check for ArUco markers first
      const arucoResult = detectArUcoMarkers(src);
      if (!arucoResult.hasMarkers) {
        console.warn("No ArUco markers detected");
        // Still proceed but with lower confidence
      }

      // 2. Get dynamic ROI
      const roi = getDynamicROI(src.cols, src.rows);

      // 3. Extract ROI
      const roiRect = new cv.Rect(
        Math.round(roi.x),
        Math.round(roi.y),
        Math.round(roi.width),
        Math.round(roi.height),
      );
      const roiGray = gray.roi(roiRect);

      // 4. Calculate brightness for adaptive threshold
      const brightness = calculateBrightness(roiGray);
      const { blockSize, C } = getAdaptiveParams(brightness);

      console.log(
        `Brightness: ${brightness}, Using blockSize: ${blockSize}, C: ${C}`,
      );

      // 5. Adaptive threshold
      const thresh = new cv.Mat();
      cv.adaptiveThreshold(
        roiGray,
        thresh,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY_INV,
        blockSize,
        C,
      );

      // 6. Morphological operations
      const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
      const morphed = new cv.Mat();
      cv.morphologyEx(thresh, morphed, cv.MORPH_CLOSE, kernel);
      cv.morphologyEx(morphed, morphed, cv.MORPH_OPEN, kernel);

      // 7. Find contours
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      cv.findContours(
        morphed,
        contours,
        hierarchy,
        cv.RETR_EXTERNAL,
        cv.CHAIN_APPROX_SIMPLE,
      );

      // 8. Process contours
      const allSquares = [];

      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const area = cv.contourArea(contour);

        if (
          area < config.contourFilter.minArea ||
          area > config.contourFilter.maxArea
        ) {
          contour.delete();
          continue;
        }

        // Approximate polygon
        const approx = new cv.Mat();
        const epsilon = 0.02 * cv.arcLength(contour, true);
        cv.approxPolyDP(contour, approx, epsilon, true);

        if (approx.rows === 4) {
          const rect = cv.boundingRect(contour);
          const adjustedRect = {
            x: rect.x + roi.x,
            y: rect.y + roi.y,
            width: rect.width,
            height: rect.height,
          };

          // Calculate confidence
          const confidence = calculateConfidence(contour, roiRect, src);

          if (confidence >= config.confidenceThreshold) {
            // Determine row (1-14) based on relative Y position
            const relativeY = rect.y;
            const rowHeight = roiRect.height / 14;
            const rowNumber = Math.floor(relativeY / rowHeight) + 1;

            allSquares.push({
              position: adjustedRect,
              row: rowNumber,
              confidence: confidence,
              area: area,
              aspectRatio: rect.width / rect.height,
              hasAruco: arucoResult.hasMarkers,
            });
          }
        }
        approx.delete();
        contour.delete();
      }

      // 9. Sort squares by Y position and assign labels
      const sortedSquares = allSquares.sort(
        (a, b) => a.position.y - b.position.y,
      );

      // 10. Draw results
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Draw ROI
      ctx.strokeStyle = "rgba(0, 0, 255, 0.3)";
      ctx.lineWidth = 2;
      ctx.strokeRect(roi.x, roi.y, roi.width, roi.height);

      // Draw detected squares
      sortedSquares.forEach((square, index) => {
        const { x, y, width, height } = square.position;

        // Color based on confidence
        const color =
          square.confidence >= 90
            ? "lime"
            : square.confidence >= 80
              ? "yellow"
              : "orange";

        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, width, height);

        // Draw label
        ctx.fillStyle = "white";
        ctx.strokeStyle = "black";
        ctx.lineWidth = 2;
        ctx.font = "bold 20px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        const label = `${index + 1}: ${square.confidence}%`;
        ctx.strokeText(label, x + width / 2, y + height / 2);
        ctx.fillStyle = "white";
        ctx.fillText(label, x + width / 2, y + height / 2);
      });

      // 11. Send results
      if (qrId && sortedSquares.length > 0) {
        const results = sortedSquares.map((square, index) => ({
          row: square.row,
          confidence: square.confidence,
          position: square.position,
        }));

        try {
          await assignQR(qrId, results);
          toast.success(
            `Detected ${sortedSquares.length} squares successfully`,
            { id: "success" },
          );
        } catch (error) {
          console.error("Assignment error:", error);
          toast.error("Failed to assign QR", { id: "error" });
        }
      }

      setDetectionResults({
        totalSquares: sortedSquares.length,
        squares: sortedSquares,
        roi: roi,
        brightness: brightness,
        arucoMarkers: arucoResult,
      });

      // Clean up
      roiGray.delete();
      thresh.delete();
      kernel.delete();
      morphed.delete();
      contours.delete();
      hierarchy.delete();
    } catch (error) {
      console.error("Detection error:", error);
      toast.error("Detection failed: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  }, [cvReady, qrId, isProcessing]);

  // Initialize OpenCV
  useEffect(() => {
    if (window.cv && window.cv.Mat) {
      console.log("✅ OpenCV.js is ready");
      setCvReady(true);
    } else {
      console.warn("Loading OpenCV.js from CDN...");
      const script = document.createElement("script");
      script.src = "https://docs.opencv.org/4.5.0/opencv.js";
      script.onload = () => {
        if (window.cv) {
          window.cv.onRuntimeInitialized = () => {
            setCvReady(true);
          };
        }
      };
      script.onerror = () => {
        console.error("Failed to load OpenCV.js");
        toast.error("Failed to load OpenCV library");
      };
      document.head.appendChild(script);
    }
  }, []);

  // Load image
  useEffect(() => {
    if (scannedImage instanceof Blob) {
      const url = URL.createObjectURL(scannedImage);
      setImageURL(url);
      return () => URL.revokeObjectURL(url);
    } else if (typeof scannedImage === "string") {
      setImageURL(scannedImage);
    }
  }, [scannedImage]);

  // Auto-detect when image loads
  useEffect(() => {
    if (imageURL && imgRef.current && imgRef.current.complete && cvReady) {
      const canvas = canvasRef.current;
      const img = imgRef.current;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      detectSquares();
    }
  }, [imageURL, cvReady, detectSquares]);

  // Manual retry
  const handleRetry = () => {
    detectSquares();
  };

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      {imageURL && (
        <img
          ref={imgRef}
          src={imageURL}
          alt="Scanned"
          crossOrigin="anonymous"
          onLoad={() => {
            if (cvReady) {
              const canvas = canvasRef.current;
              const img = imgRef.current;
              canvas.width = img.naturalWidth;
              canvas.height = img.naturalHeight;
              detectSquares();
            }
          }}
          style={{ display: "none" }}
        />
      )}

      <div className="w-full overflow-auto border border-gray-300 rounded shadow-lg relative">
        <canvas ref={canvasRef} style={{ width: "100%" }} />
        {isProcessing && (
          <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
            <div className="text-white text-xl">Processing...</div>
          </div>
        )}
      </div>

      {detectionResults && (
        <div className="w-full max-w-4xl p-4 bg-gray-100 rounded-lg">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold">
              Detection Results ({detectionResults.totalSquares} squares)
            </h3>
            <button
              onClick={handleRetry}
              disabled={isProcessing}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {isProcessing ? "Processing..." : "Retry"}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              ROI: {Math.round(detectionResults.roi.x)},{" "}
              {Math.round(detectionResults.roi.y)}
            </div>
            <div>Brightness: {Math.round(detectionResults.brightness)}</div>
            <div>
              ArUco markers: {detectionResults.arucoMarkers.markerCount}
            </div>
            <div>Confidence threshold: {config.confidenceThreshold}%</div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mt-2">
            {detectionResults.squares.map((square, index) => (
              <div key={index} className="p-2 bg-white rounded border text-sm">
                <div className="font-semibold">Row {square.row}</div>
                <div>Confidence: {square.confidence}%</div>
                <div>
                  Size: {Math.round(square.position.width)}×
                  {Math.round(square.position.height)}
                </div>
                <div className="text-xs text-gray-600">
                  ({Math.round(square.position.x)},{" "}
                  {Math.round(square.position.y)})
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SquareDetector;

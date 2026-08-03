import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { useNavigate } from "react-router-dom";

const SquareDetector = ({ scannedImage }) => {
  const navigate = useNavigate();
  const imgRef = useRef();
  const canvasRef = useRef();
  const [cvReady, setCvReady] = useState(false);
  const [imageURL, setImageURL] = useState(null);
  const [detectionParams] = useState({
    blockSize: 31,
    C: 6,
    epsilonFactor: 0.03,
    minArea: 10,
    maxArea: 100000,
    aspectRatioTolerance: 0.4,
  });
  const [roiParams] = useState({
    x: 45,
    y: 280,
    width: 55,
    height: 260,
  });

  const [isSettingRoi, setIsSettingRoi] = useState(false);
  const [roiStart, setRoiStart] = useState({ x: 0, y: 0 });
  const [roiEnd, setRoiEnd] = useState({ x: 0, y: 0 });
  const [detectedSquares, setDetectedSquares] = useState([]);

  // Prepare image URL
  useEffect(() => {
    if (scannedImage instanceof Blob) {
      const url = URL.createObjectURL(scannedImage);
      setImageURL(url);
      return () => URL.revokeObjectURL(url);
    } else if (typeof scannedImage === "string") {
      setImageURL(scannedImage);
    }
  }, [scannedImage]);

  // Ensure OpenCV is ready
  useEffect(() => {
    if (window.cv && window.cv.Mat) {
      console.log("✅ OpenCV.js is ready");
      setCvReady(true);
    } else {
      console.error("❌ OpenCV.js not found. Loading from CDN...");
      const script = document.createElement("script");
      script.src = "https://docs.opencv.org/4.5.0/opencv.js";
      script.onload = () => {
        window.cv.onRuntimeInitialized = () => {
          setCvReady(true);
        };
      };
      document.head.appendChild(script);
    }
  }, []);

  // Function to determine square number based on y-coordinate
  const getSquareNumber = (y) => {
    const ranges = [
      { min: 180, max: 210, number: 1 },
      { min: 230, max: 260, number: 2 },
      { min: 280, max: 310, number: 3 },
      { min: 330, max: 360, number: 4 },
      { min: 380, max: 410, number: 5 },
      { min: 430, max: 460, number: 6 },
      { min: 480, max: 510, number: 7 },
      { min: 530, max: 560, number: 8 },
      { min: 580, max: 610, number: 9 },
      { min: 630, max: 660, number: 10 },
      { min: 680, max: 710, number: 11 },
      { min: 730, max: 760, number: 12 },
      { min: 780, max: 810, number: 13 },
      { min: 830, max: 860, number: 14 },
    ];

    const foundRange = ranges.find((range) => y >= range.min && y <= range.max);
    return foundRange ? foundRange.number : null;
  };

  // Handle mouse down for ROI selection
  const handleMouseDown = (e) => {
    if (!isSettingRoi) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    setRoiStart({ x, y });
    setRoiEnd({ x, y });
  };

  // Handle mouse move for ROI selection
  const handleMouseMove = (e) => {
    if (!isSettingRoi || !roiStart) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    setRoiEnd({ x, y });
    drawCanvasWithRoi();
  };

  // Handle mouse up to finalize ROI selection
  const handleMouseUp = () => {
    if (!isSettingRoi || !roiStart) return;

    // Calculate ROI coordinates (ensure positive width/height)
    const x = Math.min(roiStart.x, roiEnd.x);
    const y = Math.min(roiStart.y, roiEnd.y);
    const width = Math.abs(roiEnd.x - roiStart.x);
    const height = Math.abs(roiEnd.y - roiStart.y);

    setRoiParams({
      x,
      y,
      width,
      height,
    });

    setIsSettingRoi(false);
    setRoiStart({ x: 0, y: 0 });
    setRoiEnd({ x: 0, y: 0 });

    // Redraw canvas without the selection rectangle
    drawCanvasWithRoi();
  };

  // Draw canvas with ROI rectangle
  const drawCanvasWithRoi = () => {
    if (!imgRef.current || !canvasRef.current) return;

    const img = imgRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    // Clear and draw original image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Draw existing ROI
    ctx.strokeStyle = "blue";
    ctx.lineWidth = 2;
    ctx.strokeRect(roiParams.x, roiParams.y, roiParams.width, roiParams.height);
    ctx.fillStyle = "rgba(0, 0, 255, 0.1)";
    ctx.fillRect(roiParams.x, roiParams.y, roiParams.width, roiParams.height);

    // Draw ROI being selected
    if (isSettingRoi && roiStart && roiEnd) {
      const x = Math.min(roiStart.x, roiEnd.x);
      const y = Math.min(roiStart.y, roiEnd.y);
      const width = Math.abs(roiEnd.x - roiStart.x);
      const height = Math.abs(roiEnd.y - roiStart.y);

      ctx.strokeStyle = "yellow";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(x, y, width, height);
      ctx.fillStyle = "rgba(255, 255, 0, 0.1)";
      ctx.fillRect(x, y, width, height);
      ctx.setLineDash([]);
    }

    // Draw all detected squares with their coordinates
    detectedSquares.forEach((square) => {
      const { x, y, width, height, number } = square;

      // Draw square
      ctx.strokeStyle = "lime";
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);

      // Draw coordinates text
      ctx.fillStyle = "black";
      ctx.font = "30px Arial";
      ctx.fillText(`(${x},${y})`, x + 5, y + 15);
      ctx.fillText(`${width}x${height}`, x + 5, y + 30);

      // Draw square number
      ctx.fillStyle = "cyan";
      ctx.font = "bold 12px Arial";
      ctx.fillText(number, x + width / 2 - 3, y + height / 2 + 4);
    });
  };

  // Enhanced square detection within ROI
  const detectEmptySquares = async () => {
    if (!cvReady || !imgRef.current) return;

    const img = imgRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;

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

      // Create ROI mask
      const roiRect = new cv.Rect(
        roiParams.x,
        roiParams.y,
        roiParams.width,
        roiParams.height,
      );

      // Apply ROI to the image
      const roiGray = gray.roi(roiRect);
      const roiBlurred = new cv.Mat();
      const roiThresh = new cv.Mat();
      const roiMorphed = new cv.Mat();

      // Apply Gaussian blur to reduce noise
      cv.GaussianBlur(roiGray, roiBlurred, new cv.Size(3, 3), 0);

      // Apply adaptive thresholding
      cv.adaptiveThreshold(
        roiBlurred,
        roiThresh,
        255,
        cv.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv.THRESH_BINARY_INV,
        detectionParams.blockSize,
        detectionParams.C,
      );

      // Morphological operations to clean up
      const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(2, 2));
      cv.morphologyEx(roiThresh, roiMorphed, cv.MORPH_CLOSE, kernel);
      cv.morphologyEx(roiMorphed, roiMorphed, cv.MORPH_OPEN, kernel);

      // Find contours
      cv.findContours(
        roiMorphed,
        contours,
        hierarchy,
        cv.RETR_EXTERNAL,
        cv.CHAIN_APPROX_SIMPLE,
      );

      // Clear canvas and draw original image
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Draw ROI area
      ctx.strokeStyle = "blue";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        roiParams.x,
        roiParams.y,
        roiParams.width,
        roiParams.height,
      );
      ctx.fillStyle = "rgba(0, 0, 255, 0.1)";
      ctx.fillRect(roiParams.x, roiParams.y, roiParams.width, roiParams.height);

      const squares = [];

      for (let i = 0; i < contours.size(); ++i) {
        const cnt = contours.get(i);
        const area = cv.contourArea(cnt);

        // Filter by area
        if (area < detectionParams.minArea || area > detectionParams.maxArea) {
          cnt.delete();
          continue;
        }

        const approx = new cv.Mat();
        const epsilon = detectionParams.epsilonFactor * cv.arcLength(cnt, true);
        cv.approxPolyDP(cnt, approx, epsilon, true);

        // Check if it's a quadrilateral
        if (approx.rows === 4) {
          const rect = cv.boundingRect(cnt);
          // Adjust rect coordinates to be relative to the whole image
          const adjustedRect = {
            x: rect.x + roiParams.x,
            y: rect.y + roiParams.y,
            width: rect.width,
            height: rect.height,
          };

          const aspectRatio = adjustedRect.width / adjustedRect.height;

          // Check if it's square-ish
          const isSquarish =
            Math.abs(aspectRatio - 1) < detectionParams.aspectRatioTolerance;

          if (isSquarish && adjustedRect.width > 5 && adjustedRect.height > 5) {
            // Additional convexity check
            const hull = new cv.Mat();
            cv.convexHull(cnt, hull);
            const hullArea = cv.contourArea(hull);
            const convexityRatio = area / hullArea;

            if (convexityRatio > 0.7) {
              // Get square number based on y-coordinate
              const squareNumber = getSquareNumber(adjustedRect.y);

              squares.push({
                x: adjustedRect.x,
                y: adjustedRect.y,
                width: adjustedRect.width,
                height: adjustedRect.height,
                area: area,
                number: squareNumber || "not found",
                status: squareNumber ? "found" : "notFound",
              });
            }
            hull.delete();
          }
        }

        approx.delete();
        cnt.delete();
      }

      setDetectedSquares(squares);
      // axios calling ==============================================================
      try {
        await axios.patch(
          `${import.meta.env.VITE_API_URL}/qr/assign/hdKNwF`,
          detectedSquares,
        );
        toast.success("QR assigned successfully", { id: "success" });
        // navigate("/result/hdKNwF");
      } catch (error) {
        console.error("Assignment error:", error);
        toast.error("Unable to assign the QR", { id: "failed" });
      }
      // =============================================================================
      // Log all squares with their coordinates
      console.log("Detected Squares:");
      squares.forEach((square) => {
        console.log(
          `Square ${square.number}: ` +
            `Position (${square.x}, ${square.y}), ` +
            `Size ${square.width}x${square.height}, ` +
            `Area ${square.area}`,
        );
      });

      // Clean up ROI mats
      roiGray.delete();
      roiBlurred.delete();
      roiThresh.delete();
      roiMorphed.delete();
      kernel.delete();
    } catch (error) {
      console.error("Error in square detection:", error);
    } finally {
      // Clean up memory
      src.delete();
      gray.delete();
      blurred.delete();
      thresh.delete();
      morphed.delete();
      contours.delete();
      hierarchy.delete();
    }
  };

  // Draw canvas when image loads or ROI changes
  useEffect(() => {
    if (imageURL && imgRef.current && imgRef.current.complete) {
      drawCanvasWithRoi();
    }
  }, [imageURL, roiParams, isSettingRoi, detectedSquares]);

  return (
    <div className="flex flex-col items-center gap-4 p-4">
      {imageURL && (
        <img
          ref={imgRef}
          src={imageURL}
          alt="Scanned"
          crossOrigin="anonymous"
          onLoad={() => {
            const canvas = canvasRef.current;
            const img = imgRef.current;
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            drawCanvasWithRoi();
            detectEmptySquares();
          }}
          style={{ display: "none" }}
        />
      )}

      <div className="w-full overflow-auto border border-gray-300 rounded shadow-lg">
        <canvas
          ref={canvasRef}
          className="cursor-crosshair"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          style={{ width: "100%" }}
        />
      </div>

      {/* Display detected squares information
      {detectedSquares.length > 0 && (
        <div className="w-full max-w-4xl p-4 bg-gray-100 rounded-lg">
          <h3 className="font-bold mb-2">Detected Squares ({detectedSquares.length}):</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {detectedSquares.map((square, index) => (
              <div key={index} className="p-2 bg-white rounded border">
                <div className="font-semibold">Square {square.number}</div>
                <div>Position: ({square.x}, {square.y})</div>
                <div>Size: {square.width} × {square.height}</div>
                <div>Area: {Math.round(square.area)} px²</div>
                <div>status: {square.status}</div>
              </div>
            ))}
          </div>
        </div>
      )} */}
    </div>
  );
};

export default SquareDetector;

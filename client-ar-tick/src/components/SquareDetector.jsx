import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";

// FIXED MAPPING - Each checkbox has a fixed position and name
const CHECKBOX_MAPPING = {
  1: {
    id: 1,
    title: "i_eat_while_distracted",
    fileType: "mp4",
    position: { x: 26, y: 455, size: 38 },
  },
  2: {
    id: 2,
    title: "i_eat_in_a_hurry",
    fileType: "mp4",
    position: { x: 26, y: 595, size: 38 },
  },
  3: {
    id: 3,
    title: "i_eat_mindfully",
    fileType: "jpg",
    position: { x: 26, y: 735, size: 38 },
  },
};

const CONFIG = {
  cardWidth: 600,
  cardHeight: 1000,
  minFillPercentage: 15,
  maxFillPercentage: 85,
  confidenceThreshold: 40,
};

/**
 * Analyze a checkbox using Otsu thresholding
 */
const analyzeCheckbox = (cv, checkboxMat) => {
  let gray = checkboxMat;
  let needsCleanup = false;

  if (checkboxMat.channels() > 1) {
    gray = new cv.Mat();
    cv.cvtColor(checkboxMat, gray, cv.COLOR_RGBA2GRAY);
    needsCleanup = true;
  }

  // Remove border (outer 20%)
  const insetX = Math.round(gray.cols * 0.2);
  const insetY = Math.round(gray.rows * 0.2);
  const insetW = Math.max(1, gray.cols - insetX * 2);
  const insetH = Math.max(1, gray.rows - insetY * 2);

  const innerRoi = new cv.Rect(insetX, insetY, insetW, insetH);
  const innerMat = gray.roi(innerRoi);

  // Otsu threshold
  const thresh = new cv.Mat();
  cv.threshold(innerMat, thresh, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);

  const totalPixels = thresh.rows * thresh.cols;
  const blackPixels = cv.countNonZero(thresh);
  const fillPercentage = (blackPixels / totalPixels) * 100;

  const isChecked =
    fillPercentage >= CONFIG.minFillPercentage &&
    fillPercentage <= CONFIG.maxFillPercentage;

  let confidence = 0;
  if (isChecked) {
    confidence = Math.min(100, (fillPercentage / 50) * 100);
  } else {
    confidence = Math.max(0, 100 - (fillPercentage / 20) * 100);
  }

  // Cleanup
  innerMat.delete();
  thresh.delete();
  if (needsCleanup) gray.delete();

  return {
    isChecked,
    confidence: Math.round(Math.min(Math.max(confidence, 0), 100)),
    fillPercentage: Math.round(fillPercentage),
    blackPixels,
    totalPixels,
  };
};

/**
 * MAIN DETECTION FUNCTION
 */
const detectSquares = async ({
  cv,
  imgRef,
  qrId,
  squareContent,
  navigate,
  setIsModalOpen,
  onDebug,
}) => {
  if (!cv || !imgRef?.current) {
    console.error("❌ Invalid: cv or imgRef missing");
    return;
  }

  const img = imgRef.current;
  const src = cv.imread(img);

  if (src.empty()) {
    console.error("❌ Failed to read image");
    if (setIsModalOpen) setIsModalOpen(true);
    return;
  }

  let warped = null;
  let debugMat = null;

  try {
    console.log("📐 Processing image:", src.cols, "x", src.rows);

    // Warp to standard size
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

    // RESULTS WITH FIXED MAPPING
    const results = [];
    const checkedBoxes = [];

    // Loop through FIXED checkbox positions
    Object.keys(CHECKBOX_MAPPING).forEach((key) => {
      const checkbox = CHECKBOX_MAPPING[key];
      const { x, y, size } = checkbox.position;

      // Extract checkbox region
      const cropX = Math.max(0, Math.min(x, warped.cols - 1));
      const cropY = Math.max(0, Math.min(y, warped.rows - 1));
      const cropSize = Math.min(
        size,
        Math.min(warped.cols - cropX, warped.rows - cropY),
      );

      if (cropSize > 10) {
        const roi = new cv.Rect(cropX, cropY, cropSize, cropSize);
        const checkboxMat = warped.roi(roi);
        const analysis = analyzeCheckbox(cv, checkboxMat);

        // USE THE FIXED MAPPING FOR TITLE AND FILETYPE
        const result = {
          number: checkbox.id,
          title: checkbox.title,
          fileType: checkbox.fileType,
          isChecked: analysis.isChecked,
          confidence: analysis.confidence,
          fillPercentage: analysis.fillPercentage,
        };

        results.push(result);

        if (
          analysis.isChecked &&
          analysis.confidence >= CONFIG.confidenceThreshold
        ) {
          checkedBoxes.push(result);
        }

        checkboxMat.delete();
      }
    });

    console.log("📊 Results:", results);
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

          const label = `#${result.number}: ${result.isChecked ? "✓" : "✗"} ${result.confidence}%`;
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

    // ONLY SEND IF WE HAVE CHECKED BOXES AND QR_ID
    if (checkedBoxes.length > 0 && qrId) {
      try {
        // Send the checked boxes with their proper mapping
        const payload = checkedBoxes.map((r) => ({
          number: r.number,
          title: r.title,
          fileType: r.fileType,
          confidence: r.confidence,
          fillPercentage: r.fillPercentage,
        }));

        console.log("📤 Sending checked boxes:", payload);

        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/qr/assign/${qrId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        toast.success(`✅ Found ${checkedBoxes.length} option(s)`);

        if (navigate) {
          navigate(`/result/${qrId}`);
        }

        return { success: true, checked: checkedBoxes };
      } catch (error) {
        console.error("❌ API error:", error);
        toast.error("Failed to save results");
        throw error;
      }
    } else {
      // No checkboxes found - show modal
      console.warn("⚠️ No checkboxes detected");
      if (setIsModalOpen) setIsModalOpen(true);
      return { success: false, reason: "No checkboxes detected" };
    }
  } catch (error) {
    console.error("❌ Detection error:", error);
    toast.error("Detection failed: " + error.message);
    if (setIsModalOpen) setIsModalOpen(true);
    throw error;
  } finally {
    // Cleanup
    src.delete();
    if (warped) warped.delete();
    if (debugMat) debugMat.delete();
  }
};

/**
 * SquareDetector Component
 */
const SquareDetector = ({ qrId, scannedImage }) => {
  const navigate = useNavigate();
  const imgRef = useRef(null);
  const [cvReady, setCvReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [debugInfo, setDebugInfo] = useState(null);
  const [showDebug, setShowDebug] = useState(true);

  // Load OpenCV
  useEffect(() => {
    if (window.cv?.Mat) {
      setCvReady(true);
      console.log("✅ OpenCV already ready");
      return;
    }

    console.log("🔄 Loading OpenCV...");
    const script = document.createElement("script");
    script.src = "https://docs.opencv.org/4.5.0/opencv.js";
    script.onload = () => {
      if (window.cv) {
        window.cv.onRuntimeInitialized = () => {
          setCvReady(true);
          console.log("✅ OpenCV loaded successfully");
          // If we have an image, process it
          if (imgRef.current?.complete && imgRef.current?.naturalWidth > 0) {
            processImage();
          }
        };
      }
    };
    script.onerror = () => {
      console.error("❌ Failed to load OpenCV");
      toast.error("Failed to load OpenCV library");
    };
    document.head.appendChild(script);

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  // Process image
  const processImage = async () => {
    if (!cvReady || !imgRef.current || isProcessing) {
      console.log("⏳ Waiting for OpenCV or image...");
      return;
    }

    setIsProcessing(true);
    console.log("🚀 Processing image...");

    try {
      const result = await detectSquares({
        cv: window.cv,
        imgRef,
        qrId,
        squareContent: null, // Not needed anymore - using fixed mapping
        navigate,
        setIsModalOpen,
        onDebug: (info) => {
          setDebugInfo(info);
          console.log("🔍 Debug:", info);
        },
      });

      if (!result?.success) {
        console.log("❌ Detection failed, showing modal");
        setIsModalOpen(true);
      }
    } catch (error) {
      console.error("❌ Detection failed:", error);
      toast.error("Detection failed: " + error.message);
      setIsModalOpen(true);
    } finally {
      setIsProcessing(false);
    }
  };

  // Auto-process when image loads
  useEffect(() => {
    if (cvReady && scannedImage) {
      const img = imgRef.current;
      if (img?.complete && img?.naturalWidth > 0) {
        processImage();
      }
    }
  }, [cvReady, scannedImage]);

  // If no scannedImage, show a message
  if (!scannedImage) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f3e8d4]">
        <div className="text-center">
          <p className="text-gray-600">No image to process</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f3e8d4] p-4">
      {/* Hidden image - this is the key! */}
      <img
        ref={imgRef}
        src={scannedImage}
        alt="Scanned"
        crossOrigin="anonymous"
        style={{ display: "none" }}
        onLoad={() => {
          console.log("✅ Image loaded, processing...");
          processImage();
        }}
        onError={(e) => {
          console.error("❌ Image failed to load:", e);
          toast.error("Failed to load image");
        }}
      />

      {/* Processing overlay */}
      {isProcessing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 flex flex-col items-center shadow-xl">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4" />
            <p className="text-gray-700 font-medium">Processing...</p>
          </div>
        </div>
      )}

      {/* Debug Panel */}
      {showDebug && debugInfo && (
        <div className="fixed bottom-4 left-4 right-4 max-h-[60vh] overflow-y-auto bg-black/95 p-4 rounded-lg text-white font-mono text-xs z-40 shadow-2xl border border-green-500/30">
          <div className="flex justify-between items-center sticky top-0 bg-black pb-2">
            <h3 className="text-green-400 font-bold">🔍 Detection Debug</h3>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDebug(false)}
                className="text-gray-400 hover:text-white"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="space-y-1 mt-2">
            <p>
              Image: {debugInfo.imageSize?.width} ×{" "}
              {debugInfo.imageSize?.height}
            </p>
            <p>
              Warped: {debugInfo.warpedSize?.width} ×{" "}
              {debugInfo.warpedSize?.height}
            </p>
            <p>Checkboxes: {debugInfo.checkboxes?.length || 0}</p>
            <p className="text-green-400">
              Checked: {debugInfo.checkedCount || 0}
            </p>

            {debugInfo.checkboxes?.map((box, i) => (
              <div
                key={i}
                className="flex items-center gap-2 bg-white/5 p-1 rounded"
              >
                <span
                  className={box.isChecked ? "text-green-400" : "text-red-400"}
                >
                  {box.isChecked ? "✓" : "✗"}
                </span>
                <span className="text-white font-bold">#{box.number}</span>
                <span className="text-white/70">{box.title}</span>
                <span className="text-white/50">{box.confidence}%</span>
                <span className="text-white/30">
                  {box.fillPercentage}% fill
                </span>
              </div>
            ))}

            {debugInfo.fullImageUrl && (
              <div className="mt-2">
                <p className="text-white/50 text-xs mb-1">
                  Warped Image with Detection:
                </p>
                <img
                  src={debugInfo.fullImageUrl}
                  alt="Debug"
                  className="max-h-[300px] rounded border border-white/10"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* No detection modal */}
      {isModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 text-center shadow-2xl">
            <div className="text-6xl mb-4">📋</div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">
              No Checkboxes Detected
            </h2>
            <p className="text-gray-600 mb-6">
              No checked options were found on your document.
              <br />
              Please try again with a clear image.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  window.location.reload();
                }}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                Scan Again
              </button>
              <button
                onClick={() => navigate(-1)}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SquareDetector;

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { detectSquares } from "../utils/detectSquare";
import { toast } from "react-hot-toast";

// Flip this to false once calibration is done — this whole panel disappears
const DEBUG_MODE = true;

const SquareDetector = ({ qrId, scannedImage }) => {
  const navigate = useNavigate();
  const imgRef = useRef(null);

  const [cvReady, setCvReady] = useState(false);
  const [imageURL, setImageURL] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [debugInfo, setDebugInfo] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const squareContent = {
    1: { title: "i_eat_while_distracted", fileType: "mp4" },
    2: { title: "i_eat_in_a_hurry", fileType: "mp4" },
    3: { title: "i_eat_mindfully", fileType: "jpg" },
  };

  useEffect(() => {
    if (!scannedImage) return;

    if (scannedImage instanceof Blob) {
      const url = URL.createObjectURL(scannedImage);
      setImageURL(url);
      return () => URL.revokeObjectURL(url);
    }

    if (typeof scannedImage === "string") {
      setImageURL(scannedImage);
    }
  }, [scannedImage]);

  // Replace the OpenCV loading script in SquareDetector.jsx
  useEffect(() => {
    if (window.cv?.Mat) {
      console.log("✅ OpenCV Ready");
      setCvReady(true);
      return;
    }

    console.warn("Loading OpenCV.js with contrib module...");

    // Use OpenCV.js with contrib module (includes ArUco)
    const script = document.createElement("script");
    script.src = "https://docs.opencv.org/4.10.0/opencv.js";
    // Alternative: Use a custom build with ArUco support

    script.onload = () => {
      if (window.cv) {
        window.cv.onRuntimeInitialized = () => {
          // Check if ArUco is available
          if (window.cv.aruco) {
            console.log("✅ OpenCV.js with ArUco support loaded!");
          } else {
            console.warn("⚠️ ArUco not available in this build");
          }
          setCvReady(true);
        };
      }
    };

    script.onerror = () => {
      console.error("Failed to load OpenCV.js");
      toast.error("Failed to load OpenCV library");
    };

    document.head.appendChild(script);
  }, []);

  const handleDetectSquares = async () => {
    if (
      !cvReady ||
      !imgRef.current ||
      !imgRef.current.complete ||
      isProcessing
    ) {
      return;
    }

    if (
      imgRef.current.naturalWidth === 0 ||
      imgRef.current.naturalHeight === 0
    ) {
      return;
    }

    setIsProcessing(true);
    console.log("🚀 Starting Detection...");

    try {
      await detectSquares({
        cv: window.cv,
        imgRef,
        qrId,
        squareContent,
        navigate,
        setIsModalOpen,
        onDebug: DEBUG_MODE ? setDebugInfo : undefined,
      });
    } catch (error) {
      console.error("Detection failed:", error);
      toast.error("Detection failed: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (cvReady && imageURL) {
      handleDetectSquares();
    }
  }, [cvReady, imageURL]);

  return (
    <>
      <img
        ref={imgRef}
        src={imageURL}
        alt="Scanned"
        crossOrigin="anonymous"
        style={{ display: DEBUG_MODE ? "block" : "none" }}
        onLoad={handleDetectSquares}
      />

      {/* ============ DEBUG PANEL ============ */}
      {DEBUG_MODE && debugInfo && (
        <div className="fixed bottom-4 left-4 right-4 max-h-[60vh] overflow-y-auto z-50 p-4 bg-black/95 text-green-400 font-mono text-xs rounded-lg shadow-2xl border border-green-500/30">
          <div className="flex justify-between items-center sticky top-0 bg-black pb-2">
            <h3 className="text-white font-bold text-sm">🔍 Detection Debug</h3>
            <button
              onClick={() => setDebugInfo(null)}
              className="text-gray-400 hover:text-white px-2"
            >
              ✕
            </button>
          </div>

          <div className="space-y-2">
            <p>
              Image size: {debugInfo.imageSize?.width} x{" "}
              {debugInfo.imageSize?.height}
            </p>
            <p>ROI: {JSON.stringify(debugInfo.roi)}</p>
            <p>
              Warped size: {debugInfo.warpedSize?.width} x{" "}
              {debugInfo.warpedSize?.height}
            </p>

            {debugInfo.error && (
              <p className="text-red-500 font-bold">❌ {debugInfo.error}</p>
            )}

            {debugInfo.validation && (
              <div className="mt-2 p-2 bg-gray-900 rounded">
                <p className="text-white font-bold">
                  Validation:{" "}
                  {debugInfo.validation.passed ? "✅ Passed" : "❌ Failed"}
                </p>
                {debugInfo.validation.errors?.map((err, i) => (
                  <p key={i} className="text-red-400 text-[10px]">
                    {err}
                  </p>
                ))}
              </div>
            )}

            {debugInfo.checkboxes && debugInfo.checkboxes.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2">
                {debugInfo.checkboxes.map((cb, idx) => (
                  <div
                    key={idx}
                    className="bg-gray-900 p-2 rounded border border-gray-700"
                  >
                    <div className="font-bold text-white">
                      Checkbox {cb.index}
                    </div>
                    <div
                      className={
                        cb.isChecked ? "text-green-400" : "text-yellow-400"
                      }
                    >
                      Status: {cb.isChecked ? "✅ Checked" : "⬜ Empty"}
                    </div>
                    <div>Confidence: {cb.confidence}%</div>
                    <div>Fill: {cb.fillPercentage}%</div>
                    <div className="text-gray-500 text-[10px]">
                      Pixels: {cb.blackPixels}/{cb.totalPixels}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {debugInfo.fullImageUrl && (
              <div className="mt-2">
                <p className="text-white">Warped Image with ROI:</p>
                <img
                  src={debugInfo.fullImageUrl}
                  alt="Warped"
                  className="max-w-full max-h-[300px] border border-green-500/30 rounded"
                />
              </div>
            )}

            {debugInfo.roiThresholdUrl && (
              <div className="mt-2">
                <p className="text-white">ROI Threshold:</p>
                <img
                  src={debugInfo.roiThresholdUrl}
                  alt="ROI Threshold"
                  className="max-w-full max-h-[200px] border border-red-500/30 rounded"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Processing overlay */}
      {isProcessing && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 flex flex-col items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-gray-700 font-medium">Processing image...</p>
          </div>
        </div>
      )}

      {/* Modal for no detection */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-lg p-6 shadow-xl w-96 text-center">
            <h2 className="text-xl font-semibold text-red-500 mb-3">
              No Checks Detected
            </h2>
            <p className="text-gray-600">
              No checked checkbox was detected on the scanned document.
            </p>
            <button
              className="mt-5 px-5 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 transition"
              onClick={() => {
                setIsModalOpen(false);
                window.location.reload();
              }}
            >
              Scan Again
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default SquareDetector;

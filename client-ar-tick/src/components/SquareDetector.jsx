import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { detectSquares } from "../utils/detectSquare";

// Flip this to false once calibration is done — this whole panel disappears
const DEBUG_MODE = true;

const SquareDetector = ({ qrId, scannedImage }) => {
  const navigate = useNavigate();
  const imgRef = useRef(null);

  const [cvReady, setCvReady] = useState(false);
  const [imageURL, setImageURL] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [debugInfo, setDebugInfo] = useState(null); // NEW

  const detectionParams = {
    blockSize: 31,
    C: 6,
    epsilonFactor: 0.03,
    minArea: 10,
    maxArea: 100000,
    aspectRatioTolerance: 0.4,
  };

  const roiParams = {
    xPct: 0.07,
    yPct: 0.583,
    widthPct: 0.86,
    heightPct: 0.542,
  };

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

  useEffect(() => {
    if (window.cv?.Mat) {
      console.log("✅ OpenCV Ready");
      setCvReady(true);
      return;
    }
    console.error("❌ OpenCV not loaded");
  }, []);

  const handleDetectSquares = async () => {
    if (!cvReady) return;
    if (!imgRef.current) return;
    if (!imgRef.current.complete) return;
    if (imgRef.current.naturalWidth === 0 || imgRef.current.naturalHeight === 0)
      return;

    console.log("🚀 Starting Square Detection...");

    await detectSquares({
      cv: window.cv,
      imgRef,
      qrId,
      detectionParams,
      roiParams,
      squareContent,
      navigate,
      setIsModalOpen,
      onDebug: DEBUG_MODE ? setDebugInfo : undefined, // NEW
    });
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

      {/* ============ DEBUG PANEL — visible on screen, no download needed ============ */}
      {DEBUG_MODE && debugInfo && (
        <div
          style={{
            padding: 16,
            background: "#111",
            color: "#0f0",
            fontFamily: "monospace",
            fontSize: 12,
          }}
        >
          <h3 style={{ color: "#fff" }}>🔍 Detection Debug</h3>

          <p>
            Image size: {debugInfo.imageSize?.width} x{" "}
            {debugInfo.imageSize?.height}
          </p>
          <p>ROI used: {JSON.stringify(debugInfo.roi)}</p>
          {debugInfo.error && (
            <p style={{ color: "red" }}>❌ {debugInfo.error}</p>
          )}

          <p style={{ color: "#fff", marginTop: 12 }}>
            Full cropped/warped image (what the camera captured):
          </p>
          {debugInfo.fullImageUrl && (
            <img
              src={debugInfo.fullImageUrl}
              alt="full crop"
              style={{ maxWidth: "100%", border: "2px solid lime" }}
            />
          )}

          <p style={{ color: "#fff", marginTop: 12 }}>
            ROI slice, after threshold (what the algorithm actually searches):
          </p>
          {debugInfo.roiThresholdUrl ? (
            <img
              src={debugInfo.roiThresholdUrl}
              alt="roi threshold"
              style={{ maxWidth: "100%", border: "2px solid red" }}
            />
          ) : (
            <p style={{ color: "orange" }}>(not generated — see error above)</p>
          )}

          {debugInfo.fallbackThresholdUrl && (
            <>
              <p style={{ color: "#fff", marginTop: 12 }}>
                Fallback ROI slice after threshold (full width scan):
              </p>
              <img
                src={debugInfo.fallbackThresholdUrl}
                alt="fallback roi threshold"
                style={{ maxWidth: "100%", border: "2px solid orange" }}
              />
            </>
          )}
        </div>
      )}

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
              className="mt-5 px-5 py-2 rounded bg-blue-600 text-white"
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

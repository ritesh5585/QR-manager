// ============================================
// FILE: components/SquareDetector.jsx (FIXED)
// ============================================

import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import { detectSquares } from "../utils/detectSquare";

const SquareDetector = ({ qrId, scannedImage }) => {
  const navigate = useNavigate();
  const imgRef = useRef(null);
  const [cvReady, setCvReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [debugInfo, setDebugInfo] = useState(null);
  const [showDebug, setShowDebug] = useState(true);

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

  const processImage = async () => {
    if (!cvReady || !imgRef.current || isProcessing) {
      console.log("⏳ Waiting for OpenCV or image...");
      return;
    }

    setIsProcessing(true);
    console.log("🚀 Processing image...");

    try {
      // FIXED: Don't double-handle errors - detectSquares handles its own UI
      const result = await detectSquares({
        cv: window.cv,
        imgRef,
        qrId,
        navigate,
        setIsModalOpen,
        onDebug: (info) => {
          setDebugInfo(info);
          console.log("🔍 Debug:", info);
        },
      });

      // Log the result for debugging
      console.log("📊 Detection result:", result);
    } catch (error) {
      // This should only catch unexpected errors, not normal flow
      console.error("❌ Unexpected error in SquareDetector:", error);
      // Don't open modal or toast here - detectSquares already handled it
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    if (cvReady && scannedImage) {
      const img = imgRef.current;
      if (img?.complete && img?.naturalWidth > 0) {
        processImage();
      }
    }
  }, [cvReady, scannedImage]);

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

      {isProcessing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 flex flex-col items-center shadow-xl">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4" />
            <p className="text-gray-700 font-medium">Processing...</p>
          </div>
        </div>
      )}

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
            <p>Global Threshold: {debugInfo.globalThreshold}</p>
            <p>Baseline: {debugInfo.baseline}%</p>
            <p>Margin: {debugInfo.margin}%</p>
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
                <span className="text-white/70">{box.displayName}</span>
                <span className="text-white/50">{box.fillPercentage}%</span>
              </div>
            ))}

            {debugInfo.fullImageUrl && (
              <img
                src={debugInfo.fullImageUrl}
                alt="Debug"
                className="mt-2 max-h-[300px] rounded border border-white/10"
              />
            )}
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 text-center shadow-2xl">
            <div className="text-6xl mb-4">📋</div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">
              No Checkboxes Detected
            </h2>
            <p className="text-gray-600 mb-6">
              No checked options were found on your document.
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

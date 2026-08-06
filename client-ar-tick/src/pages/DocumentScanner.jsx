// ============================================
// FILE: src/pages/DocumentScanner.jsx
// (YOUR ORIGINAL WORKING CODE)
// ============================================

import React, { useState } from "react";
import { useParams } from "react-router-dom";
import MarkerDetectionVisualizer from "../components/MarkerDetectionVisualizer";
import SquareDetector from "../components/SquareDetector";

const DocumentScanner = () => {
  const { qrId } = useParams();
  const [capturedImage, setCapturedImage] = useState(null);

  const handleImageCaptured = (imageDataUrl) => {
    console.log("📸 Image captured!");
    setCapturedImage(imageDataUrl);
  };

  if (capturedImage) {
    return (
      <div className="min-h-screen bg-[#f3e8d4] relative">
        <SquareDetector qrId={qrId} scannedImage={capturedImage} />
        <button
          onClick={() => setCapturedImage(null)}
          className="fixed bottom-4 left-4 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition shadow-lg z-50"
        >
          ← Scan Again
        </button>
      </div>
    );
  }

  return (
    <MarkerDetectionVisualizer onFourMarkersDetected={handleImageCaptured} />
  );
};

export default DocumentScanner;

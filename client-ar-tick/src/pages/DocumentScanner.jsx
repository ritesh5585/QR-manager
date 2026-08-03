import React, { useState } from "react";
import MarkerDetectionVisualizer from "../components/MarkerDetectionVisualizer";
import SquareDetector from "../components/SquareDetector";
import { useParams } from "react-router-dom";

const DocumentScanner = () => {
  const {qrId} = useParams();
  const [scannedImage, setScannedImage] = useState(null);

  return (
    <div>
      <MarkerDetectionVisualizer onFourMarkersDetected={setScannedImage} />
      {scannedImage && <SquareDetector qrId={qrId} scannedImage={scannedImage} />}
    </div>
  );
};

export default DocumentScanner;
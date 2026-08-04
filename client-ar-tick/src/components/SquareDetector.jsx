import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { detectSquares } from "../utils/detectSquare";

const SquareDetector = ({ qrId, scannedImage }) => {
  const navigate = useNavigate();
  const imgRef = useRef(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
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

  const [roiParamsPct] = useState({
    xPct: 0.07, // 45 / 640
    yPct: 0.583, // 280 / 480
    widthPct: 0.086, // 55 / 640
    heightPct: 0.542, // 260 / 480
  });

  const squareContent = {
    1: { title: "i_eat_while_distracted", fileType: "mp4" },
    2: { title: "i_eat_in_a_hurry", fileType: "mp4" },
    3: { title: "i_eat_mindfully", fileType: "jpg" },
  };

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

  const handleDetectSquares = async () => {
    if (!cvReady || !imgRef.current) return;

    const img = imgRef.current;
    if (!img.naturalWidth || !img.naturalHeight) return;

    const roiParams = {
      x: Math.round(img.naturalWidth * roiParamsPct.xPct),
      y: Math.round(img.naturalHeight * roiParamsPct.yPct),
      width: Math.round(img.naturalWidth * roiParamsPct.widthPct),
      height: Math.round(img.naturalHeight * roiParamsPct.heightPct),
    };

    await detectSquares({
      cv: window.cv,
      imgRef,
      qrId,
      detectionParams,
      roiParams,
      squareContent,
      navigate,
      setIsModalOpen,
    });
  };

  useEffect(() => {
    if (cvReady && imageURL) {
      handleDetectSquares();
    }
  }, [cvReady, imageURL]);

  // Return null to render nothing
  return (
    <>
      <img
        ref={imgRef}
        src={imageURL}
        alt="Scanned"
        crossOrigin="anonymous"
        style={{ display: "none" }}
      />
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[1px] z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="text-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-12 w-12 mx-auto text-yellow-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 mt-3">
                No Checks Detected
              </h3>
              <div className="mt-4">
                <button
                  type="button"
                  className="inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:text-sm"
                  onClick={() => {
                    setIsModalOpen(false);
                    window.location.reload();
                  }}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default SquareDetector;

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "react-hot-toast";
import { useNavigate } from "react-router-dom";

const SquareDetector = ({ qrId, scannedImage }) => {
  const navigate = useNavigate();
  const imgRef = useRef();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [cvReady, setCvReady] = useState(false);
  const [imageURL, setImageURL] = useState(null);
  const [detectionParams] = useState({
    blockSize: 31,
    C: 6,
    epsilonFactor: 0.03,
    minArea: 10,
    maxArea: 100000,
    aspectRatioTolerance: 0.4
  });
  const [roiParams] = useState({
    x: 45,
    y: 280,
    width: 55,
    height: 260
  });

  const squareContent = {
    1: { title: "i_eat_while_distracted", fileType: "mp4" },
    2: { title: "i_eat_in_a_hurry", fileType: "mp4"  },
    3: { title: "i_eat_mindfully", fileType: "jpg"  }
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
      const script = document.createElement('script');
      script.src = 'https://docs.opencv.org/4.5.0/opencv.js';
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
      { min: 285, max: 295, number: 1 },
      { min: 385, max: 395, number: 2 },
      { min: 485, max: 495, number: 3 }
    ];

    const foundRange = ranges.find(range => y >= range.min && y <= range.max);
    return foundRange ? foundRange.number : null;
  };

  // Enhanced square detection within ROI
  const detectSquares = async () => {
    if (!cvReady || !imgRef.current) return;
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

      // Create ROI mask
      const roiRect = new cv.Rect(
        roiParams.x, 
        roiParams.y, 
        roiParams.width, 
        roiParams.height
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
        detectionParams.C
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
        cv.CHAIN_APPROX_SIMPLE
      );

      // First collect all found squares
      const foundSquares = [];
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
            height: rect.height
          };
          
          const aspectRatio = adjustedRect.width / adjustedRect.height;
          
          // Check if it's square-ish
          const isSquarish = Math.abs(aspectRatio - 1) < detectionParams.aspectRatioTolerance;
          
          if (isSquarish && adjustedRect.width > 5 && adjustedRect.height > 5) {
            // Additional convexity check
            const hull = new cv.Mat();
            cv.convexHull(cnt, hull);
            const hullArea = cv.contourArea(hull);
            const convexityRatio = area / hullArea;
            
            if (convexityRatio > 0.7) {
              // Get square number based on y-coordinate
              const squareNumber = getSquareNumber(adjustedRect.y);
              
              foundSquares.push({
                x: adjustedRect.x,
                y: adjustedRect.y,
                width: adjustedRect.width,
                height: adjustedRect.height,
                area: area,
                number: squareNumber,
                status: "found"
              });
            }
            hull.delete();
          }
        }
          
          approx.delete();
          cnt.delete();
      }

      // Create array with all 14 squares, filling in missing ones
      const allSquares = Array.from({ length: 3 }, (_, i) => {
        const squareNumber = i + 1;
        const foundSquare = foundSquares.find(sq => sq.number === squareNumber);
        
        return foundSquare || {
          x: null,
          y: null,
          width: null,
          height: null,
          area: null,
          number: squareNumber,
          status: "notFound"
        };
      });

      let checkedSquares = [];

      function getCheckedSquares(squareArray) {
        squareArray.forEach(square => {
          if (square.status === "notFound") {
            const content = squareContent[square.number] || {};
            checkedSquares.push({
              number: square.number,
              title: content.title || `Square ${square.number}`,
              fileType: content.fileType
            });
          }
        });

        return checkedSquares;
      }

      getCheckedSquares(allSquares);

      // Make API call if any square is missing
      if(checkedSquares.length > 0){
        try {
          await axios.patch(`${import.meta.env.VITE_API_URL}/qr/assign/${qrId}`, checkedSquares);
          toast.success("QR assigned successfully", {id: "success"});
          navigate(`/result/${qrId}`); 
        } catch (error) {
          console.error("Assignment error:", error);
          toast.error("Unable to process the QR", {id: "failed"});
        }
      } else {
        setIsModalOpen(true);
      }

      // Clean up ROI mats
      roiGray.delete();
      roiBlurred.delete();
      roiThresh.delete();
      roiMorphed.delete();
      kernel.delete();
    } catch (error) {
      console.error('Error in square detection:', error);
      toast.error("Error detecting squares");
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

  // Return null to render nothing
  return (
    <>
      <img
        ref={imgRef}
        src={imageURL}
        alt="Scanned"
        crossOrigin="anonymous"
        style={{ display: "none" }}
        onLoad={detectSquares}
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
              <h3 className="text-lg font-medium text-gray-900 mt-3">No Checks Detected</h3>
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
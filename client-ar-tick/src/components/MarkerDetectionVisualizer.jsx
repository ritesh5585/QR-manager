import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  detectCornerBlocks,
  orderBlocksForDocument,
  isPlausibleCard,
  cornersAreStable,
} from "../utils/cornerBlockDetector";
import { getVideoTrack, isTorchSupported, setTorch } from "../utils/flashlight";
import { getAverageBrightness, isDark } from "../utils/lightLevel";
import {
  requestCameraWithFallback,
  getCameraErrorMessage,
  checkCameraAvailability,
} from "../utils/cameraHelper";

// ---- Icons ----
const CameraOffIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
    <path d="M1 1l22 22M9.5 5H15l2 2h3a2 2 0 0 1 2 2v9.5M15 15.5A4 4 0 1 1 8 12M3 7v10a2 2 0 0 0 2 2h10" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CameraOnIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
    <path d="M9.5 5H15l2 2h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3z" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);

const FlashOnIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M13 2 3 14h7l-1 8 11-14h-7l1-6z" />
  </svg>
);

const FlashOffIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
    <path d="M13 2 3 14h7l-1 8 11-14h-7l1-6z" strokeLinecap="round" strokeLinejoin="round" opacity="0.4" />
    <path d="M2 2l20 20" strokeLinecap="round" />
  </svg>
);

// ---- Performance knobs ----
const DETECTION_INTERVAL_MS = 150;
const DETECTION_WIDTH = 320;

const MarkerDetectionVisualizer = ({ onFourMarkersDetected }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const trackRef = useRef(null);
  const animationRef = useRef(null);

  const [croppedImage, setCroppedImage] = useState(null);
  const [cameraOn, setCameraOn] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [dark, setDark] = useState(false);
  const [markersFound, setMarkersFound] = useState(0);
  const [locking, setLocking] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cvReady, setCvReady] = useState(false);
  const [facingMode, setFacingMode] = useState("environment");
  const [isFlipping, setIsFlipping] = useState(false);

  // Load OpenCV
  useEffect(() => {
    console.log("🔄 Loading OpenCV...");
    if (window.cv && window.cv.Mat) {
      console.log("✅ OpenCV already loaded");
      setCvReady(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://docs.opencv.org/4.5.0/opencv.js";
    script.async = true;
    script.onload = () => {
      if (window.cv) {
        window.cv.onRuntimeInitialized = () => {
          console.log("✅ OpenCV loaded successfully");
          setCvReady(true);
        };
      }
    };
    script.onerror = () => {
      console.error("❌ Failed to load OpenCV");
      setCameraError("OpenCV library failed to load");
      setIsLoading(false);
    };
    document.head.appendChild(script);

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  const toggleTorch = useCallback(async () => {
    const next = !torchOn;
    const ok = await setTorch(trackRef.current, next);
    if (ok) setTorchOn(next);
  }, [torchOn]);

  // Flip camera between front and back
  const flipCamera = useCallback(async () => {
    if (isFlipping) return;
    setIsFlipping(true);

    // Stop current stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      trackRef.current = null;
    }

    // Toggle facing mode
    const newFacingMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(newFacingMode);
    
    try {
      await startCameraWithMode(newFacingMode);
    } catch (error) {
      console.error("Flip camera error:", error);
      // Try to revert
      try {
        await startCameraWithMode(facingMode);
      } catch (revertError) {
        setCameraError("Failed to switch camera");
      }
    }
    
    setIsFlipping(false);
  }, [facingMode, isFlipping]);

  // Start camera with specific mode
  const startCameraWithMode = useCallback(async (mode) => {
    try {
      setIsLoading(true);
      setCameraError(null);

      if (!navigator.mediaDevices) {
        throw new Error("Camera not supported. Please use HTTPS or localhost.");
      }

      const stream = await requestCameraWithFallback(mode);

      streamRef.current = stream;
      const track = getVideoTrack(stream);
      trackRef.current = track;
      setTorchAvailable(isTorchSupported(track));

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
        console.log(`📷 Camera started successfully with mode: ${mode}`);
        console.log(`📹 Video dimensions: ${video.videoWidth}x${video.videoHeight}`);
        setIsLoading(false);
      }
    } catch (err) {
      console.error("Camera Error:", err);
      const userMessage = getCameraErrorMessage(err);
      setCameraError(userMessage);
      setIsLoading(false);
      throw err;
    }
  }, []);

  // Start camera with fallbacks
  const startCamera = useCallback(async () => {
    await startCameraWithMode(facingMode);
  }, [facingMode, startCameraWithMode]);

  // Handle camera on/off
  useEffect(() => {
    if (!cameraOn) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        trackRef.current = null;
      }
      setIsLoading(false);
      return;
    }

    // Check camera availability first
    checkCameraAvailability().then(result => {
      if (!result.available) {
        setCameraError("No camera found on this device");
        setIsLoading(false);
        return;
      }
      startCamera();
    });

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        trackRef.current = null;
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [cameraOn, startCamera]);

  // Main render loop - displays video on canvas
  useEffect(() => {
    if (!cameraOn || cameraError || !streamRef.current || isLoading) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!video || !canvas) {
      console.warn("Video or canvas element not found");
      return;
    }

    const context = canvas.getContext("2d", { willReadFrequently: true });

    let lastDetectionTime = 0;
    let cancelled = false;
    let processed = false;
    let stableFrames = 0;
    let previousOrdered = null;

    // Small canvas for detection
    const smallCanvas = document.createElement("canvas");
    const smallContext = smallCanvas.getContext("2d", {
      willReadFrequently: true,
    });

    const renderFrame = (timestamp) => {
      if (cancelled || !cameraOn) {
        return;
      }

      try {
        // Check if video is ready
        if (!video || video.readyState < 2) {
          animationRef.current = requestAnimationFrame(renderFrame);
          return;
        }

        // Set canvas size to match video
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 480;

        if (canvas.width !== vw || canvas.height !== vh) {
          canvas.width = vw;
          canvas.height = vh;
        }

        // Draw video frame to canvas (mirror for front camera)
        if (facingMode === "user") {
          context.save();
          context.scale(-1, 1);
          context.drawImage(video, -vw, 0, vw, vh);
          context.restore();
        } else {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
        }

        // Only run detection every few frames
        const dueForDetection = timestamp - lastDetectionTime >= DETECTION_INTERVAL_MS;

        if (dueForDetection && cvReady && !processed) {
          lastDetectionTime = timestamp;

          try {
            // Downscale for detection
            const scale = DETECTION_WIDTH / canvas.width;
            smallCanvas.width = DETECTION_WIDTH;
            smallCanvas.height = Math.round(canvas.height * scale);
            
            // Draw mirrored for detection if front camera
            if (facingMode === "user") {
              smallContext.save();
              smallContext.scale(-1, 1);
              smallContext.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
              smallContext.restore();
            } else {
              smallContext.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height);
            }

            const cv = window.cv;
            const srcMat = cv.imread(smallCanvas);
            const blocks = detectCornerBlocks(cv, srcMat);
            srcMat.delete();

            setMarkersFound(blocks.length);

            if (blocks.length >= 4) {
              const ordered = orderBlocksForDocument(blocks);
              const plausible = ordered && isPlausibleCard(ordered);
              const stable = ordered && cornersAreStable(ordered, previousOrdered);

              if (plausible && stable) {
                stableFrames += 1;
              } else {
                stableFrames = 0;
              }
              previousOrdered = ordered;

              setLocking(stableFrames > 0 && stableFrames < 3);

              if (stableFrames >= 3 && !processed) {
                processed = true;
                console.log("🎯 Document detected! Capturing...");

                const invScale = 1 / scale;
                const orderedCorners = [
                  [ordered.topLeft.center.x * invScale, ordered.topLeft.center.y * invScale],
                  [ordered.topRight.center.x * invScale, ordered.topRight.center.y * invScale],
                  [ordered.bottomRight.center.x * invScale, ordered.bottomRight.center.y * invScale],
                  [ordered.bottomLeft.center.x * invScale, ordered.bottomLeft.center.y * invScale],
                ];

                // Capture the image
                const cv2 = window.cv;
                const srcMat2 = cv2.imread(canvas);
                const srcTri = cv2.matFromArray(4, 1, cv2.CV_32FC2, orderedCorners.flat());

                const width = 480;
                const height = 800;

                const dstTri = cv2.matFromArray(4, 1, cv2.CV_32FC2, [
                  0, 0,
                  width, 0,
                  width, height,
                  0, height,
                ]);

                const M = cv2.getPerspectiveTransform(srcTri, dstTri);
                const dst = new cv2.Mat();
                const dsize = new cv2.Size(width, height);
                cv2.warpPerspective(
                  srcMat2,
                  dst,
                  M,
                  dsize,
                  cv2.INTER_LINEAR,
                  cv2.BORDER_CONSTANT,
                  new cv2.Scalar()
                );

                const resultCanvas = document.createElement("canvas");
                resultCanvas.width = width;
                resultCanvas.height = height;
                cv2.imshow(resultCanvas, dst);
                const dataUrl = resultCanvas.toDataURL();

                // Stop camera
                if (streamRef.current) {
                  streamRef.current.getTracks().forEach((t) => t.stop());
                  streamRef.current = null;
                  trackRef.current = null;
                }
                setCameraOn(false);

                setCroppedImage(dataUrl);
                if (onFourMarkersDetected) {
                  onFourMarkersDetected(dataUrl);
                }

                srcMat2.delete();
                dst.delete();
                M.delete();
                srcTri.delete();
                dstTri.delete();
              }
            } else {
              stableFrames = 0;
            }
          } catch (detectError) {
            console.error("Detection error:", detectError);
          }
        }

        // Continue animation
        animationRef.current = requestAnimationFrame(renderFrame);
      } catch (err) {
        console.error("Render error:", err);
        animationRef.current = requestAnimationFrame(renderFrame);
      }
    };

    // Start the render loop
    animationRef.current = requestAnimationFrame(renderFrame);

    return () => {
      cancelled = true;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [cameraOn, cameraError, cvReady, onFourMarkersDetected, facingMode, isLoading]);

  // Retry camera
  const retryCamera = () => {
    setCameraError(null);
    setCroppedImage(null);
    setCameraOn(true);
    setIsLoading(true);
    setTimeout(startCamera, 300);
  };

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      {/* Video element - hidden, used as source */}
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted
        className="hidden"
        style={{ display: "none" }}
      />

      {/* Canvas element - shows the video with overlays */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-contain"
        style={{ backgroundColor: "#000" }}
      />

      {!croppedImage ? (
        <>
          {cameraOn ? (
            <>
              {isLoading || !cvReady ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-black px-4 z-10">
                  <div className="text-white text-center max-w-sm w-full">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                    <p className="text-lg font-semibold">
                      {!cvReady ? "Loading OpenCV..." : "Starting camera..."}
                    </p>
                    {!cvReady && (
                      <p className="text-xs text-gray-400 mt-2">
                        Downloading computer vision library...
                      </p>
                    )}
                  </div>
                </div>
              ) : cameraError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 bg-black z-10">
                  <div className="text-center max-w-sm w-full">
                    <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                      <CameraOffIcon className="w-8 h-8 text-red-500" />
                    </div>
                    <p className="text-red-500 text-lg font-semibold">Camera Error</p>
                    <p className="text-red-400 text-sm mt-2">{cameraError}</p>
                  </div>
                  <button
                    onClick={retryCamera}
                    className="px-6 py-2 bg-white text-black rounded-full font-medium"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                // Camera is working - overlays on top of canvas
                <>
                  <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/70 pointer-events-none z-10" />

                  <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-[env(safe-area-inset-top)] pt-4 z-20">
                    <h1 className="text-white text-lg font-semibold tracking-wide drop-shadow">
                      Scan Your Card
                    </h1>
                    <div className="flex gap-2">
                      {/* Flip Camera Button */}
                      <button
                        onClick={flipCamera}
                        disabled={isFlipping}
                        className="w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md bg-white/15 text-white hover:bg-white/25 transition-colors disabled:opacity-50"
                        aria-label="Flip camera"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                          <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M8 12l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M12 8v12" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>

                      {torchAvailable && (
                        <button
                          onClick={toggleTorch}
                          aria-label="Toggle flashlight"
                          className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md transition-colors ${
                            torchOn
                              ? "bg-yellow-400 text-black"
                              : "bg-white/15 text-white"
                          }`}
                        >
                          {torchOn ? (
                            <FlashOnIcon className="w-5 h-5" />
                          ) : (
                            <FlashOffIcon className="w-5 h-5" />
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          setCameraOn(false);
                          if (streamRef.current) {
                            streamRef.current.getTracks().forEach((t) => t.stop());
                            streamRef.current = null;
                            trackRef.current = null;
                          }
                        }}
                        aria-label="Turn camera off"
                        className="w-11 h-11 rounded-full flex items-center justify-center bg-white/15 text-white backdrop-blur-md"
                      >
                        <CameraOffIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-10 z-10">
                    <motion.div
                      animate={{
                        borderColor: locking ? "#facc15" : "#ffffff80",
                        scale: locking ? 1.01 : 1,
                      }}
                      transition={{ duration: 0.25 }}
                      className="w-full max-w-[340px] aspect-[3/5] rounded-2xl border-[3px] border-dashed"
                    />
                  </div>

                  <div className="absolute bottom-10 left-0 right-0 flex flex-col items-center gap-2 px-6 z-20">
                    <motion.div
                      key={markersFound}
                      initial={{ scale: 0.9, opacity: 0.7 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="bg-black/60 backdrop-blur-md text-white px-4 py-2 rounded-full text-sm flex items-center gap-2"
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          markersFound >= 4
                            ? "bg-green-400"
                            : "bg-yellow-400 animate-pulse"
                        }`}
                      />
                      {markersFound >= 4
                        ? "Hold steady..."
                        : `Align all 4 corners in view (${markersFound}/4 found)`}
                    </motion.div>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 bg-black z-10">
              <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
                <CameraOffIcon className="w-7 h-7 text-white/70" />
              </div>
              <p className="text-white/70 text-sm">Camera is off</p>
              <button
                onClick={() => {
                  setCameraOn(true);
                  setCroppedImage(null);
                  setIsLoading(true);
                }}
                className="flex items-center gap-2 bg-white text-black font-medium px-5 py-2.5 rounded-full"
              >
                <CameraOnIcon className="w-4 h-4" />
                Turn camera on
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#f3e8d4] px-6">
          <img
            src={croppedImage}
            alt="Cropped document"
            className="max-h-[60vh] max-w-full object-contain rounded-xl border border-gray-200 shadow-lg"
          />
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-4 w-full max-w-sm">
            <div className="w-5 h-5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin shrink-0" />
            <div>
              <p className="text-blue-800 font-medium">
                Document captured successfully
              </p>
              <p className="text-blue-600 text-sm mt-0.5">
                Processing your document...
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MarkerDetectionVisualizer;
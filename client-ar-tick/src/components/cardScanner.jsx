import { useCallback, useEffect, useRef, useState } from "react";
import { warpCard, drawCardBounds } from "../utils/cardWarp";
import { analyzeCheckboxes } from "../utils/checkboxDetector";
import { CARD_CONFIG } from "../cards/eatingStyle/config";
import { toast } from "react-hot-toast";
import { motion } from "framer-motion";
import { getVideoTrack, isTorchSupported, setTorch } from "../utils/flashlight";
import {
  requestCameraWithFallback,
  getCameraErrorMessage,
} from "../utils/cameraHelper";
import {
  loadReferenceCard,
  findCard,
  cleanupReference,
} from "../utils/cardMatcher";

// ============================================================
// SETTINGS
// ============================================================

const DETECTION_INTERVAL = 200;

// Minimum ORB matches required before we trust the card.
const MIN_MATCHES = 25;

// Card must be detected this many times consecutively.
const REQUIRED_STABLE_FRAMES = 3;

// ============================================================
// SIMPLE ICONS
// ============================================================

const CameraOffIcon = ({ className = "" }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    viewBox="0 0 24 24"
  >
    <path
      d="M15 10l4.5-3A1 1 0 0121 7.8v8.4a1 1 0 01-1.5.8L15 14"
      strokeLinecap="round"
      strokeLinejoin="round"
    />

    <rect x="3" y="6" width="12" height="12" rx="2" />

    <path d="M3 3l18 18" strokeLinecap="round" />
  </svg>
);

const CameraOnIcon = ({ className = "" }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    viewBox="0 0 24 24"
  >
    <rect x="3" y="6" width="18" height="12" rx="2" />

    <circle cx="12" cy="12" r="3" />
  </svg>
);

// ============================================================
// MAIN COMPONENT
// ============================================================

const CardScanner = ({ onCardScanned }) => {
  // ----------------------------------------------------------
  // React / DOM references
  // ----------------------------------------------------------

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Camera stream
  const streamRef = useRef(null);

  // Current camera track
  const trackRef = useRef(null);

  // requestAnimationFrame ID
  const animationRef = useRef(null);

  // ----------------------------------------------------------
  // Detection state
  // ----------------------------------------------------------

  // Number of consecutive frames where card was found.
  //
  // IMPORTANT:
  // This is a ref, not a normal variable.
  //
  // It survives React re-renders.
  const stableFramesRef = useRef(0);

  // Last time ORB detection was performed.
  const lastDetectionRef = useRef(0);

  // Prevent processing the same card multiple times.
  const processedRef = useRef(false);

  // ----------------------------------------------------------
  // UI state
  // ----------------------------------------------------------

  const [cameraOn, setCameraOn] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cvReady, setCvReady] = useState(false);
  const [facingMode] = useState("environment");
  const [cardFound, setCardFound] = useState(false);
  const [cardDetected, setCardDetected] = useState(false);
  const [matches, setMatches] = useState(0);

  // ==========================================================
  // LOAD OPENCV
  // ==========================================================

  useEffect(() => {
    // OpenCV is already available.
    if (window.cv?.Mat) {
      setCvReady(true);
      return;
    }

    console.log("Loading OpenCV...");
    const script = document.createElement("script");
    script.src = "https://docs.opencv.org/4.5.0/opencv.js";
    script.async = true;
    script.onload = () => {
      if (!window.cv) {
        console.error("OpenCV script loaded but window.cv is missing.");
        return;
      }
      // OpenCV may still be initializing.
      window.cv.onRuntimeInitialized = () => {
        console.log("✅ OpenCV ready");
        setCvReady(true);
      };
    };

    script.onerror = () => {
      console.error("❌ Failed to load OpenCV");
    };

    document.head.appendChild(script);
    // Remove script when component is destroyed.
    return () => {
      script.remove();
    };
  }, []);

  // ==========================================================
  // LOAD REFERENCE CARD
  // ==========================================================
  useEffect(() => {
    if (!cvReady) {
      return;
    }

    const loadCard = async () => {
      const success = await loadReferenceCard(
        window.cv,
        CARD_CONFIG.referenceImage,
      );

      if (success) {
        console.log("✅ Reference car-d ready");
      } else {
        console.error("❌ Reference card could not be loaded");
      }
    };
    loadCard();
    return () => {
      cleanupReference();
    };
  }, [cvReady]);

  // ==========================================================
  // STOP CAMERA
  // ==========================================================

  const stopCamera = useCallback(() => {
    // Stop all camera tracks.
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });

      streamRef.current = null;
    }

    // Stop animation loop.
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    trackRef.current = null;
    setTorchOn(false);
  }, []);

  // ==========================================================
  // START CAMERA
  // ==========================================================

  const startCamera = useCallback(async () => {
    try {
      setIsLoading(true);
      setCameraError(null);

      // Get camera stream.
      const stream = await requestCameraWithFallback(facingMode);
      streamRef.current = stream;

      // Get video track for torch support.
      const track = getVideoTrack(stream);
      trackRef.current = track;
      setTorchAvailable(isTorchSupported(track));

      // Attach stream to video element.
      if (!videoRef.current) {
        throw new Error("Video element is not available.");
      }
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setIsLoading(false);
    } catch (error) {
      console.error("Camera error:", error);
      setCameraError(getCameraErrorMessage(error));
      setIsLoading(false);
    }
  }, [facingMode]);

  // ==========================================================
  // CAMERA LIFECYCLE
  // ==========================================================

  useEffect(() => {
    if (!cameraOn) {
      return;
    }
    startCamera();
    return () => {
      stopCamera();
    };
  }, [cameraOn, startCamera, stopCamera]);

  // ==========================================================
  // PROCESS DETECTED CARD
  // ==========================================================

  const processCard = useCallback(
    (cv, sourceImage, corners) => {
      console.log("🎯 Card detected and stable!");

      // ------------------------------------------------------
      // STEP 1
      // Straighten card.
      // ------------------------------------------------------

      const warpedCard = warpCard(
        cv,
        sourceImage,
        corners,
        CARD_CONFIG.cardWidth,
        CARD_CONFIG.cardHeight,
      );

      if (!warpedCard) {
        console.error("❌ Could not warp card");
        processedRef.current = false;
        return;
      }

      try {
        // ----------------------------------------------------
        // STEP 2
        // Analyze known checkbox positions.
        //
        // IMPORTANT:
        // We don't search the entire card anymore.
        //
        // The config already tells us where
        // every checkbox is.
        // ----------------------------------------------------

        const analysis = analyzeCheckboxes(cv, warpedCard, CARD_CONFIG);
        console.log("📊 Checkbox results:", analysis);

        // ----------------------------------------------------
        // STEP 3
        // Convert warped card to an image.
        // ----------------------------------------------------

        const warpedCanvas = document.createElement("canvas");
        warpedCanvas.width = CARD_CONFIG.cardWidth;
        warpedCanvas.height = CARD_CONFIG.cardHeight;
        cv.imshow(warpedCanvas, warpedCard);

        // ----------------------------------------------------
        // STEP 4
        // Check whether at least one box
        // was checked.
        // ----------------------------------------------------

        if (analysis.checkedCount === 0) {
          toast.info("No checkbox detected. Please tick a box and try again.");
          processedRef.current = false;
          stableFramesRef.current = 0;
          setCardDetected(false);
          return;
        }

        // ----------------------------------------------------
        // STEP 5
        // Send result to parent component.
        // ----------------------------------------------------

        if (onCardScanned) {
          onCardScanned(
            analysis.checkedBoxes,
            warpedCanvas.toDataURL("image/jpeg", 0.9),
          );
        }

        // ----------------------------------------------------
        // STEP 6
        // Stop camera.
        // ----------------------------------------------------

        stopCamera();
        setCameraOn(false);
      } finally {
        // Always free OpenCV memory.
        warpedCard.delete();
      }
    },
    [onCardScanned, stopCamera],
  );

  // ==========================================================
  // MAIN CAMERA / DETECTION LOOP
  // ==========================================================

  useEffect(() => {
    // Don't start detection until everything is ready.
    if (!cameraOn || cameraError || isLoading || !cvReady) {
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) {
      return;
    }
    const context = canvas.getContext("2d", {
      willReadFrequently: true,
    });

    // --------------------------------------------------------
    // Process one camera frame.
    // --------------------------------------------------------

    const processFrame = (timestamp) => {
      if (!cameraOn) {
        return;
      }

      try {
        // Camera is not ready yet.
        if (video.readyState < 2) {
          animationRef.current = requestAnimationFrame(processFrame);
          return;
        }
        const width = video.videoWidth || 640;
        const height = video.videoHeight || 480;
        // Resize canvas if camera resolution changed.
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }

        // ----------------------------------------------------
        // Draw camera image on canvas.
        // ----------------------------------------------------

        context.drawImage(video, 0, 0, width, height);
        // ----------------------------------------------------
        // Don't run ORB on every animation frame.
        //
        // Camera might run at 60 FPS.
        // ORB doesn't need to run 60 times/sec.
        // ----------------------------------------------------
        const now = Date.now();
        const enoughTimePassed =
          now - lastDetectionRef.current >= DETECTION_INTERVAL;
        if (enoughTimePassed && !processedRef.current) {
          lastDetectionRef.current = now;
          detectCard(context, canvas);
        }

        // Continue loop.
        animationRef.current = requestAnimationFrame(processFrame);
      } catch (error) {
        console.error("Camera frame error:", error);
        animationRef.current = requestAnimationFrame(processFrame);
      }
    };

    // --------------------------------------------------------
    // CARD DETECTION
    // --------------------------------------------------------

    const detectCard = (context, canvas) => {
      const cv = window.cv;
      let sourceImage = null;
      try {
        // Convert canvas → OpenCV Mat.
        sourceImage = cv.imread(canvas);

        // ----------------------------------------------
        // Find our card using ORB.
        // ----------------------------------------------

        const result = findCard(cv, sourceImage);

        // ----------------------------------------------
        // Card not found.
        // ----------------------------------------------

        if (!result || !result.found || result.matches < MIN_MATCHES) {
          setMatches(0);
          setCardFound(false);
          setCardDetected(false);
          stableFramesRef.current = 0;
          return;
        }

        // ----------------------------------------------
        // Card found.
        // ----------------------------------------------

        setMatches(result.matches);
        setCardFound(true);
        // ----------------------------------------------
        // Draw detected card border.
        // ----------------------------------------------

        drawCardBounds(cv, sourceImage, result.corners);
        cv.imshow(canvas, sourceImage);

        // ----------------------------------------------
        // Card detected in another frame.
        // ----------------------------------------------

        stableFramesRef.current += 1;
        const isStable = stableFramesRef.current >= REQUIRED_STABLE_FRAMES;
        setCardDetected(isStable);

        // ----------------------------------------------
        // Wait until card is stable.
        // ----------------------------------------------

        if (!isStable) {
          return;
        }

        // ----------------------------------------------
        // Prevent duplicate processing.
        // ----------------------------------------------

        processedRef.current = true;
        processCard(cv, sourceImage, result.corners);
      } catch (error) {
        console.error("Card detection error:", error);
      } finally {
        // IMPORTANT:
        // Every cv.imread() must eventually
        // have a matching .delete().
        if (sourceImage) {
          sourceImage.delete();
        }
      }
    };

    // Start loop.
    animationRef.current = requestAnimationFrame(processFrame);

    // Cleanup.
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [cameraOn, cameraError, isLoading, cvReady, processCard]);

  // ==========================================================
  // TORCH
  // ==========================================================

  const toggleTorch = () => {
    if (!trackRef.current) {
      return;
    }

    const nextState = !torchOn;
    setTorch(trackRef.current, nextState);
    setTorchOn(nextState);
  };

  // ==========================================================
  // RETRY CAMERA
  // ==========================================================

  const retryCamera = () => {
    setCameraError(null);
    setCameraOn(true);
    startCamera();
  };

  // ==========================================================
  // UI
  // ==========================================================

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      {/* =====================================================
          REAL VIDEO ELEMENT

          Hidden because we draw the video onto canvas.
      ====================================================== */}

      <video ref={videoRef} playsInline autoPlay muted className="hidden" />

      {/* =====================================================
          CAMERA CANVAS
      ====================================================== */}

      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-contain"
      />

      {/* =====================================================
          LOADING
      ====================================================== */}

      {(isLoading || !cvReady) && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black">
          <div className="text-center text-white">
            <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-white" />
            <p className="text-lg font-semibold">
              {!cvReady ? "Loading scanner..." : "Starting camera..."}
            </p>
          </div>
        </div>
      )}

      {/* =====================================================
          CAMERA ERROR
      ====================================================== */}

      {!isLoading && cvReady && cameraError && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black px-6 text-center">
          <p className="text-lg font-semibold text-red-500">{cameraError}</p>
          <button
            onClick={retryCamera}
            className="mt-4 rounded-full bg-white px-6 py-2 text-black"
          >
            Retry
          </button>
        </div>
      )}

      {/* =====================================================
          SCANNER UI
      ====================================================== */}

      {!isLoading && cvReady && !cameraError && (
        <>
          {/* Dark overlay */}
          <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-b from-black/60 via-transparent to-black/70" />

          {/* =================================================
                TOP BAR
            ================================================= */}

          <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-4 pt-4">
            <h1 className="text-lg font-semibold text-white">Scan Your Card</h1>

            <div className="flex gap-2">
              {/* Torch */}
              {torchAvailable && (
                <button
                  onClick={toggleTorch}
                  className={`flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-md ${
                    torchOn
                      ? "bg-yellow-400 text-black"
                      : "bg-white/15 text-white"
                  }`}
                >
                  {torchOn ? (
                    <span className="text-xl">⚡</span>
                  ) : (
                    <span className="text-xl">🔦</span>
                  )}
                </button>
              )}

              {/* Stop camera */}
              <button
                onClick={() => {
                  stopCamera();
                  setCameraOn(false);
                }}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md"
              >
                <CameraOffIcon className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* =================================================
                CARD GUIDE
            ================================================= */}

          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-10">
            <motion.div
              animate={{
                borderColor: cardDetected
                  ? "#22c55e"
                  : cardFound
                    ? "#facc15"
                    : "#ffffff80",

                scale: cardDetected ? 1.02 : cardFound ? 1.01 : 1,
              }}
              transition={{
                duration: 0.25,
              }}
              className="aspect-[3/5] w-full max-w-[340px] rounded-2xl border-[3px] border-dashed"
            />
          </div>

          {/* =================================================
                STATUS
            ================================================= */}

          <div className="absolute bottom-10 left-0 right-0 z-20 flex justify-center px-6">
            <motion.div
              key={matches}
              initial={{
                scale: 0.9,
                opacity: 0.7,
              }}
              animate={{
                scale: 1,
                opacity: 1,
              }}
              className="flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-sm text-white backdrop-blur-md"
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  cardDetected
                    ? "bg-green-400"
                    : cardFound
                      ? "animate-pulse bg-yellow-400"
                      : "animate-pulse bg-red-400"
                }`}
              />

              {cardDetected
                ? "✅ Card detected! Hold steady..."
                : cardFound
                  ? `Hold steady... (${matches} matches)`
                  : "Position card in frame"}
            </motion.div>
          </div>
        </>
      )}
    </div>
  );
};

export default CardScanner;

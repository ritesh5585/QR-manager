import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-hot-toast";
import {
  requestCameraWithFallback,
  getCameraErrorMessage,
  checkCameraAvailability,
  getCameraPermissionStatus,
} from "../utils/cameraHelper";
import { getVideoTrack, isTorchSupported, setTorch } from "../utils/flashlight";
import {
  loadReferenceCard,
  findCard,
  cleanupReference,
} from "../utils/cardMatcher";
import { warpCard, drawCardBounds } from "../utils/cardWarp";
import {
  computeGlobalThreshold,
  analyzeCheckboxes,
} from "../utils/checkboxDetector";
import { CARD_CONFIG } from "../cards/config";

// ---- Icons ----
const CameraOffIcon = (props) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    {...props}
  >
    <path
      d="M1 1l22 22M9.5 5H15l2 2h3a2 2 0 0 1 2 2v9.5M15 15.5A4 4 0 1 1 8 12M3 7v10a2 2 0 0 0 2 2h10"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CameraOnIcon = (props) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    {...props}
  >
    <path
      d="M9.5 5H15l2 2h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);

const FlashOnIcon = (props) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M13 2 3 14h7l-1 8 11-14h-7l1-6z" />
  </svg>
);

const FlashOffIcon = (props) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    {...props}
  >
    <path
      d="M13 2 3 14h7l-1 8 11-14h-7l1-6z"
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity="0.4"
    />
    <path d="M2 2l20 20" strokeLinecap="round" />
  </svg>
);

const FlipIcon = (props) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    {...props}
  >
    <path
      d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M8 12l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 8v12" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ---- Performance Settings ----
const FRAME_INTERVAL = 100;
const MIN_MATCHES = 25;
const STABLE_FRAMES_REQUIRED = 3;

const CardScanner = ({ onCardScanned, qrId }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const displayCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const trackRef = useRef(null);
  const animationRef = useRef(null);

  const [cameraOn, setCameraOn] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cvReady, setCvReady] = useState(false);
  const [facingMode, setFacingMode] = useState("environment");
  const [isFlipping, setIsFlipping] = useState(false);

  const [cardDetected, setCardDetected] = useState(false);
  const [cardFound, setCardFound] = useState(false);
  const [matches, setMatches] = useState(0);
  const [permissionStatus, setPermissionStatus] = useState("unknown");

  // Stable frame tracking
  const stableFrames = useRef(0);
  const lastDetection = useRef(0);
  const processed = useRef(false);

  // Load OpenCV
  useEffect(() => {
    if (window.cv?.Mat) {
      setCvReady(true);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://docs.opencv.org/4.5.0/opencv.js";
    script.onload = () => {
      if (window.cv) {
        window.cv.onRuntimeInitialized = () => {
          setCvReady(true);
          console.log("✅ OpenCV loaded");
        };
      }
    };
    script.onerror = () => {
      console.error("❌ Failed to load OpenCV");
      setCameraError("OpenCV library failed to load");
    };
    document.head.appendChild(script);
  }, []);

  // Load reference card
  useEffect(() => {
    if (cvReady) {
      const loadRef = async () => {
        try {
          const loaded = await loadReferenceCard(
            window.cv,
            CARD_CONFIG.referenceImage,
          );
          if (loaded) {
            console.log("✅ Reference card loaded");
          } else {
            console.error("❌ Failed to load reference card");
            toast.error("Failed to load reference card image");
          }
        } catch (err) {
          console.error("❌ Error loading reference:", err);
        }
      };
      loadRef();
    }

    return () => {
      cleanupReference();
    };
  }, [cvReady]);

  // Check camera permission
  useEffect(() => {
    const checkPermission = async () => {
      try {
        const status = await getCameraPermissionStatus();
        setPermissionStatus(status);
        if (status === "denied") {
          setCameraError(
            "Camera access is blocked. Please enable camera in your browser settings.",
          );
        }
      } catch (err) {
        console.warn("Permission check failed:", err);
      }
    };
    checkPermission();
  }, []);

  // Camera setup - MOBILE OPTIMIZED
  const startCamera = useCallback(async () => {
    try {
      setIsLoading(true);
      setCameraError(null);

      // Check for secure context
      if (!window.isSecureContext && window.location.protocol !== "https:") {
        console.warn(
          "⚠️ Not in secure context. Camera may not work on mobile.",
        );
      }

      // Request camera with mobile-optimized constraints
      const stream = await requestCameraWithFallback(facingMode);
      streamRef.current = stream;

      const track = getVideoTrack(stream);
      trackRef.current = track;
      setTorchAvailable(isTorchSupported(track));

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        videoRef.current.setAttribute("webkit-playsinline", "true");

        // Wait for video to be ready
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(reject, 10000);
          videoRef.current.onloadedmetadata = () => {
            clearTimeout(timeout);
            resolve();
          };
          videoRef.current.onerror = reject;
        });

        await videoRef.current.play();
        console.log("📷 Camera started successfully");
        console.log(
          `📹 Video: ${videoRef.current.videoWidth}x${videoRef.current.videoHeight}`,
        );
        setIsLoading(false);
      }
    } catch (err) {
      console.error("Camera error:", err);
      const userMessage = getCameraErrorMessage(err);
      setCameraError(userMessage);
      toast.error(userMessage);
      setIsLoading(false);
    }
  }, [facingMode]);

  // Start/stop camera
  useEffect(() => {
    if (cameraOn) {
      const timer = setTimeout(() => {
        startCamera();
      }, 300);
      return () => clearTimeout(timer);
    } else {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        trackRef.current = null;
      }
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    }
  }, [cameraOn, startCamera]);

  // Toggle torch
  const toggleTorch = useCallback(async () => {
    if (!torchAvailable) return;
    const next = !torchOn;
    const ok = await setTorch(trackRef.current, next);
    if (ok) setTorchOn(next);
  }, [torchOn, torchAvailable]);

  // Flip camera
  const flipCamera = useCallback(async () => {
    if (isFlipping) return;
    setIsFlipping(true);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      trackRef.current = null;
    }

    const newFacingMode = facingMode === "environment" ? "user" : "environment";
    setFacingMode(newFacingMode);

    try {
      await startCamera();
    } catch (err) {
      console.error("Flip error:", err);
    }

    setIsFlipping(false);
  }, [facingMode, isFlipping, startCamera]);

  // Main render loop
  useEffect(() => {
    if (
      !cameraOn ||
      cameraError ||
      !streamRef.current ||
      isLoading ||
      !cvReady
    ) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const displayCanvas = displayCanvasRef.current;

    if (!video || !canvas || !displayCanvas) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const displayCtx = displayCanvas.getContext("2d", {
      willReadFrequently: true,
    });

    const renderFrame = () => {
      if (!cameraOn || !video) {
        animationRef.current = requestAnimationFrame(renderFrame);
        return;
      }

      try {
        if (video.readyState < 2) {
          animationRef.current = requestAnimationFrame(renderFrame);
          return;
        }

        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 480;

        if (canvas.width !== vw || canvas.height !== vh) {
          canvas.width = vw;
          canvas.height = vh;
        }

        if (displayCanvas.width !== vw || displayCanvas.height !== vh) {
          displayCanvas.width = vw;
          displayCanvas.height = vh;
        }

        // Draw video to display canvas
        if (facingMode === "user") {
          displayCtx.save();
          displayCtx.scale(-1, 1);
          displayCtx.drawImage(video, -vw, 0, vw, vh);
          displayCtx.restore();
        } else {
          displayCtx.drawImage(video, 0, 0, vw, vh);
        }

        // Copy to processing canvas
        ctx.drawImage(displayCanvas, 0, 0);

        // Process every FRAME_INTERVAL ms
        const now = Date.now();
        if (
          now - lastDetection.current >= FRAME_INTERVAL &&
          cvReady &&
          !processed.current
        ) {
          lastDetection.current = now;
          detectCard(ctx, canvas);
        }

        // Draw overlay
        drawOverlay(displayCtx, vw, vh);

        animationRef.current = requestAnimationFrame(renderFrame);
      } catch (err) {
        console.error("Render error:", err);
        animationRef.current = requestAnimationFrame(renderFrame);
      }
    };

    // Detection function
    const detectCard = (ctx, canvas) => {
      try {
        const cv = window.cv;
        const src = cv.imread(canvas);

        const result = findCard(cv, src);

        if (result && result.found && result.matches >= MIN_MATCHES) {
          setMatches(result.matches);
          setCardFound(true);

          // Draw debug bounds
          const debugCanvas = document.createElement("canvas");
          debugCanvas.width = canvas.width;
          debugCanvas.height = canvas.height;
          const debugCtx = debugCanvas.getContext("2d");
          debugCtx.drawImage(canvas, 0, 0);

          const debugMat = cv.imread(debugCanvas);
          drawCardBounds(cv, debugMat, result.corners);
          debugMat.delete();
          debugCanvas.remove();

          stableFrames.current += 1;
          setCardDetected(stableFrames.current >= STABLE_FRAMES_REQUIRED);

          if (
            stableFrames.current >= STABLE_FRAMES_REQUIRED &&
            !processed.current
          ) {
            processed.current = true;
            console.log("🎯 Card detected! Processing...");
            processCard(cv, canvas, result);
          }
        } else {
          setMatches(result?.matches || 0);
          setCardFound(false);
          setCardDetected(false);
          stableFrames.current = 0;
          processed.current = false;
        }

        src.delete();
      } catch (err) {
        console.error("Detection error:", err);
        processed.current = false;
      }
    };

    // Process card after detection
    const processCard = (cv, canvas, result) => {
      try {
        const srcMat = cv.imread(canvas);

        const warped = warpCard(
          cv,
          srcMat,
          result.corners,
          CARD_CONFIG.cardWidth,
          CARD_CONFIG.cardHeight,
        );

        if (warped && !warped.empty()) {
          console.log("✅ Card warped successfully");

          const globalThreshold = computeGlobalThreshold(
            cv,
            warped,
            CARD_CONFIG.checkboxes,
          );

          const analysis = analyzeCheckboxes(
            cv,
            warped,
            CARD_CONFIG,
            globalThreshold,
          );

          console.log("📊 Detection results:", analysis);

          let cardImageData = null;
          try {
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = CARD_CONFIG.cardWidth;
            tempCanvas.height = CARD_CONFIG.cardHeight;
            cv.imshow(tempCanvas, warped);
            cardImageData = tempCanvas.toDataURL("image/jpeg", 0.9);
            tempCanvas.remove();
          } catch (convertErr) {
            console.warn("Could not convert warped image:", convertErr);
          }

          if (analysis.checkedCount > 0) {
            console.log("✅ Card scanned successfully:", analysis.checkedBoxes);

            if (onCardScanned) {
              onCardScanned(analysis.checkedBoxes, cardImageData);
            }

            toast.success(`Detected ${analysis.checkedCount} option(s)!`);

            setTimeout(() => {
              processed.current = false;
              stableFrames.current = 0;
              setCardDetected(false);
            }, 2000);
          } else {
            toast("No options detected - try adjusting lighting", {
              icon: "💡",
              duration: 3000,
            });

            setTimeout(() => {
              processed.current = false;
              stableFrames.current = 0;
              setCardDetected(false);
            }, 1000);
          }

          warped.delete();
        } else {
          console.error("❌ Failed to warp card");
          processed.current = false;
          stableFrames.current = 0;
          setCardDetected(false);
        }

        if (srcMat) {
          srcMat.delete();
        }
      } catch (err) {
        console.error("❌ Card processing error:", err);
        processed.current = false;
        stableFrames.current = 0;
        setCardDetected(false);
        toast.error("Failed to process card. Please try again.");
      }
    };

    // Draw overlay
    const drawOverlay = (ctx, width, height) => {
      const boxWidth = Math.min(width * 0.8, 400);
      const boxHeight = boxWidth * 1.4;
      const x = (width - boxWidth) / 2;
      const y = (height - boxHeight) / 2;

      // Animated border
      ctx.strokeStyle = cardDetected
        ? "#22c55e"
        : cardFound
          ? "#facc15"
          : "rgba(255,255,255,0.3)";
      ctx.lineWidth = cardDetected ? 4 : 3;
      ctx.setLineDash([10, 10]);
      ctx.strokeRect(x, y, boxWidth, boxHeight);
      ctx.setLineDash([]);

      // Corner markers
      const cornerSize = 30;
      const cornerColor = cardDetected
        ? "#22c55e"
        : cardFound
          ? "#facc15"
          : "#ffffff80";
      ctx.strokeStyle = cornerColor;
      ctx.lineWidth = 4;

      // Top-left
      ctx.beginPath();
      ctx.moveTo(x, y + cornerSize);
      ctx.lineTo(x, y);
      ctx.lineTo(x + cornerSize, y);
      ctx.stroke();

      // Top-right
      ctx.beginPath();
      ctx.moveTo(x + boxWidth - cornerSize, y);
      ctx.lineTo(x + boxWidth, y);
      ctx.lineTo(x + boxWidth, y + cornerSize);
      ctx.stroke();

      // Bottom-left
      ctx.beginPath();
      ctx.moveTo(x, y + boxHeight - cornerSize);
      ctx.lineTo(x, y + boxHeight);
      ctx.lineTo(x + cornerSize, y + boxHeight);
      ctx.stroke();

      // Bottom-right
      ctx.beginPath();
      ctx.moveTo(x + boxWidth - cornerSize, y + boxHeight);
      ctx.lineTo(x + boxWidth, y + boxHeight);
      ctx.lineTo(x + boxWidth, y + boxHeight - cornerSize);
      ctx.stroke();

      // Status text on overlay
      if (cardDetected) {
        ctx.fillStyle = "#22c55e";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("✅ Card Detected", width / 2, y - 20);
      } else if (cardFound) {
        ctx.fillStyle = "#facc15";
        ctx.font = "14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(`🔍 ${matches} matches found`, width / 2, y - 20);
      }
    };

    animationRef.current = requestAnimationFrame(renderFrame);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [
    cameraOn,
    cameraError,
    cvReady,
    isLoading,
    facingMode,
    onCardScanned,
    cardDetected,
    cardFound,
    matches,
  ]);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <video
        ref={videoRef}
        playsInline
        autoPlay
        muted
        className="hidden"
        style={{ display: "none" }}
      />

      <canvas ref={canvasRef} style={{ display: "none" }} />

      <canvas
        ref={displayCanvasRef}
        className="absolute inset-0 w-full h-full object-contain"
        style={{ backgroundColor: "#000" }}
      />

      {/* Loading / OpenCV Loading */}
      <AnimatePresence>
        {(isLoading || !cvReady) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-black z-10"
          >
            <div className="text-white text-center">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"
              />
              <p className="text-lg font-semibold">
                {!cvReady ? "Loading OpenCV..." : "Starting camera..."}
              </p>
              <p className="text-sm text-gray-400 mt-2">
                {!cvReady
                  ? "Downloading computer vision library..."
                  : "Please allow camera access"}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Camera Error */}
      <AnimatePresence>
        {cameraError && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10 p-6"
          >
            <div className="text-center max-w-sm w-full">
              <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                <CameraOffIcon className="w-10 h-10 text-red-500" />
              </div>
              <h2 className="text-white text-xl font-bold mb-2">
                Camera Error
              </h2>
              <p className="text-red-400 text-sm">{cameraError}</p>

              {permissionStatus === "denied" && (
                <div className="mt-4 p-4 bg-yellow-500/20 rounded-lg border border-yellow-500/30">
                  <p className="text-yellow-400 text-sm">
                    To enable camera access on mobile:
                    <br />
                    1. Tap the 🔒 icon in the address bar
                    <br />
                    2. Allow camera permissions
                    <br />
                    3. Refresh the page
                  </p>
                </div>
              )}

              <button
                onClick={() => {
                  setCameraError(null);
                  startCamera();
                }}
                className="mt-6 px-8 py-3 bg-white text-black rounded-full font-medium hover:bg-gray-200 transition"
              >
                Retry
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Camera is on - Show scanner */}
      {!cameraError && cameraOn && !isLoading && cvReady && (
        <>
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/70 pointer-events-none z-10" />

          {/* Top Controls */}
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-4 z-20">
            <div>
              <h1 className="text-white text-lg font-semibold tracking-wide drop-shadow-lg">
                Scan Your Card
              </h1>
              <p className="text-gray-300 text-xs mt-1 opacity-80">
                {qrId ? `QR: ${qrId}` : "Place card in frame"}
              </p>
            </div>
            <div className="flex gap-2">
              {/* Flip Camera Button */}
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={flipCamera}
                disabled={isFlipping}
                className="w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md bg-white/20 text-white hover:bg-white/30 transition-all disabled:opacity-50 border border-white/10"
                aria-label="Flip camera"
              >
                <FlipIcon className="w-5 h-5" />
              </motion.button>

              {/* Flashlight Button */}
              {torchAvailable && (
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={toggleTorch}
                  className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md transition-all border border-white/10 ${
                    torchOn
                      ? "bg-yellow-400 text-black"
                      : "bg-white/20 text-white hover:bg-white/30"
                  }`}
                  aria-label="Toggle flashlight"
                >
                  {torchOn ? (
                    <FlashOnIcon className="w-5 h-5" />
                  ) : (
                    <FlashOffIcon className="w-5 h-5" />
                  )}
                </motion.button>
              )}

              {/* Close Camera Button */}
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => setCameraOn(false)}
                className="w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md bg-white/20 text-white hover:bg-white/30 transition-all border border-white/10"
                aria-label="Turn camera off"
              >
                <CameraOffIcon className="w-5 h-5" />
              </motion.button>
            </div>
          </div>

          {/* Card Guide Box */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-10 z-10">
            <motion.div
              animate={{
                borderColor: cardDetected
                  ? "#22c55e"
                  : cardFound
                    ? "#facc15"
                    : "rgba(255,255,255,0.4)",
                scale: cardDetected ? 1.02 : cardFound ? 1.01 : 1,
                boxShadow: cardDetected
                  ? "0 0 60px rgba(34, 197, 94, 0.3)"
                  : cardFound
                    ? "0 0 40px rgba(250, 204, 21, 0.2)"
                    : "none",
              }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-[340px] aspect-[3/5] rounded-2xl border-[3px] border-dashed"
            />
          </div>

          {/* Bottom Status */}
          <div className="absolute bottom-10 left-0 right-0 flex flex-col items-center gap-3 px-6 z-20">
            <motion.div
              key={matches}
              initial={{ scale: 0.9, opacity: 0.7 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-black/60 backdrop-blur-xl text-white px-6 py-3 rounded-full text-sm flex items-center gap-3 border border-white/10"
            >
              <span
                className={`w-3 h-3 rounded-full ${
                  cardDetected
                    ? "bg-green-400 animate-pulse"
                    : cardFound
                      ? "bg-yellow-400 animate-pulse"
                      : "bg-red-400 animate-pulse"
                }`}
              />
              {cardDetected
                ? "✅ Card detected! Hold steady..."
                : cardFound
                  ? `Hold steady... (${matches} matches)`
                  : `Position card in frame (${matches} matches)`}
            </motion.div>

            {/* Progress indicator */}
            {cardFound && !cardDetected && (
              <div className="w-48 h-1 bg-white/20 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-yellow-400 rounded-full"
                  initial={{ width: "0%" }}
                  animate={{
                    width: `${Math.min((stableFrames.current / STABLE_FRAMES_REQUIRED) * 100, 100)}%`,
                  }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            )}
          </div>
        </>
      )}

      {/* Camera Off State */}
      {!cameraOn && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10"
        >
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-6">
              <CameraOnIcon className="w-10 h-10 text-white/70" />
            </div>
            <h2 className="text-white text-xl font-semibold mb-2">
              Camera is Off
            </h2>
            <p className="text-gray-400 text-sm mb-6">
              Turn on the camera to start scanning
            </p>
            <button
              onClick={() => {
                setCameraOn(true);
                setIsLoading(true);
                startCamera();
              }}
              className="px-8 py-3 bg-white text-black rounded-full font-medium hover:bg-gray-200 transition"
            >
              Turn Camera On
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default CardScanner;

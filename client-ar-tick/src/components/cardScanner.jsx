import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
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
// ✅ FIXED: Import from src/cards, not public
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

    // In the detectCard function:
    const detectCard = (ctx, canvas) => {
      try {
        const cv = window.cv;
        const src = cv.imread(canvas);

        const result = findCard(cv, src);

        if (result && result.found && result.matches >= MIN_MATCHES) {
          setMatches(result.matches);
          setCardFound(true);

          // Don't draw to display canvas - draw to separate canvas instead
          const debugCanvas = document.createElement("canvas");
          debugCanvas.width = canvas.width;
          debugCanvas.height = canvas.height;
          const debugCtx = debugCanvas.getContext("2d");
          debugCtx.drawImage(canvas, 0, 0);

          const debugMat = cv.imread(debugCanvas);
          drawCardBounds(cv, debugMat, result.corners);
          // cv.imshow(displayCanvasRef.current, debugMat); // Remove this line

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
          // Reset processed flag when card is lost
          processed.current = false;
        }

        src.delete();
      } catch (err) {
        console.error("Detection error:", err);
        processed.current = false;
      }
    };
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
          console.log("Warped dimensions:", warped.cols, "x", warped.rows);

          // Check if card is inverted (dark/light)
          const isInverted = checkCardInversion(cv, warped);

          let analysisWarped = warped;
          if (isInverted) {
            console.log("🔄 Card appears inverted, inverting...");
            const inverted = new cv.Mat();
            cv.bitwise_not(warped, inverted);
            analysisWarped = inverted;
          }

          const globalThreshold = computeGlobalThreshold(
            cv,
            analysisWarped,
            CARD_CONFIG.checkboxes,
          );

          console.log("📊 Global threshold:", globalThreshold);

          const analysis = analyzeCheckboxes(
            cv,
            analysisWarped,
            CARD_CONFIG,
            globalThreshold,
          );

          console.log("📊 Detection results:", analysis);
          console.log("Checked boxes:", analysis.checkedBoxes);
          console.log("Checked count:", analysis.checkedCount);

          // FIX: Convert the Mat to a canvas properly before passing it back
          let cardImageData = null;
          try {
            // Create a temporary canvas to convert the Mat to an image
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = CARD_CONFIG.cardWidth;
            tempCanvas.height = CARD_CONFIG.cardHeight;
            cv.imshow(tempCanvas, analysisWarped);
            cardImageData = tempCanvas.toDataURL("image/jpeg", 0.9);
            tempCanvas.remove(); // Clean up
          } catch (convertErr) {
            console.warn(
              "Could not convert warped image to data URL:",
              convertErr,
            );
          }

          if (analysis.checkedCount > 0) {
            console.log("✅ Card scanned successfully:", analysis.checkedBoxes);

            // Call the callback with the proper data
            if (onCardScanned) {
              onCardScanned(
                analysis.checkedBoxes,
                cardImageData, // Pass the data URL instead of the Mat
              );
            }

            toast.success(`Detected ${analysis.checkedCount} option(s)!`);

            // Reset for next scan after a delay
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

            // Reset for retry
            setTimeout(() => {
              processed.current = false;
              stableFrames.current = 0;
              setCardDetected(false);
            }, 1000);
          }

          // Clean up OpenCV Mats
          if (analysisWarped !== warped && analysisWarped) {
            analysisWarped.delete();
          }
          if (warped) {
            warped.delete();
          }
        } else {
          console.error("❌ Failed to warp card - warped is empty");
          processed.current = false;
          stableFrames.current = 0;
          setCardDetected(false);
        }

        if (srcMat) {
          srcMat.delete();
        }
      } catch (err) {
        console.error("❌ Card processing error:", err);
        console.error("Error details:", err.message, err.code);
        processed.current = false;
        stableFrames.current = 0;
        setCardDetected(false);

        // Show user-friendly error
        toast.error("Failed to process card. Please try again.");
      }
    };
    // Helper to check if card is inverted (dark background, light text vs light background, dark text)
    const checkCardInversion = (cv, mat) => {
      // Sample the corners and center to determine if card is inverted
      const corners = [
        [0, 0],
        [0, mat.rows - 1],
        [mat.cols - 1, 0],
        [mat.cols - 1, mat.rows - 1],
        [Math.floor(mat.cols / 2), Math.floor(mat.rows / 2)],
      ];

      let totalBrightness = 0;
      corners.forEach(([x, y]) => {
        const pixel = mat.ucharPtr(y, x);
        totalBrightness += pixel[0]; // Assuming grayscale
      });

      const avgBrightness = totalBrightness / corners.length;
      console.log("Average corner brightness:", avgBrightness);

      // If corners are dark (< 128), card might be inverted
      return avgBrightness < 80;
    };

    // Visualization helper
    const createCheckboxVisualization = (cv, mat, config, analysis) => {
      const vizCanvas = document.createElement("canvas");
      vizCanvas.width = mat.cols;
      vizCanvas.height = mat.rows;

      const rgbMat = new cv.Mat();
      cv.cvtColor(mat, rgbMat, cv.COLOR_GRAY2RGB);

      // Draw checkbox regions
      config.checkboxes.forEach((checkbox) => {
        const color = analysis.checkedBoxes?.includes(checkbox.id)
          ? [0, 255, 0, 255] // Green for checked
          : [255, 0, 0, 255]; // Red for unchecked

        cv.rectangle(
          rgbMat,
          new cv.Point(checkbox.x, checkbox.y),
          new cv.Point(
            checkbox.x + checkbox.width,
            checkbox.y + checkbox.height,
          ),
          color,
          2,
        );

        // Add label
        cv.putText(
          rgbMat,
          checkbox.id || "?",
          new cv.Point(checkbox.x, checkbox.y - 5),
          cv.FONT_HERSHEY_SIMPLEX,
          0.5,
          color,
          1,
        );
      });

      cv.imshow(vizCanvas, rgbMat);
      rgbMat.delete();

      // Show visualization briefly
      vizCanvas.style.cssText = `
    position: fixed;
    bottom: 10px;
    right: 10px;
    width: 200px;
    border: 2px solid white;
    z-index: 1000;
  `;
      document.body.appendChild(vizCanvas);
      setTimeout(() => vizCanvas.remove(), 5000);

      return vizCanvas;
    };

    // Draw overlay
    const drawOverlay = (ctx, width, height) => {
      const boxWidth = Math.min(width * 0.8, 400);
      const boxHeight = boxWidth * 1.4;
      const x = (width - boxWidth) / 2;
      const y = (height - boxHeight) / 2;

      ctx.strokeStyle = cardDetected
        ? "#22c55e"
        : cardFound
          ? "#facc15"
          : "rgba(255,255,255,0.3)";
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 10]);
      ctx.strokeRect(x, y, boxWidth, boxHeight);
      ctx.setLineDash([]);

      const cornerSize = 30;
      ctx.strokeStyle = cardDetected ? "#22c55e" : "#ffffff80";
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
    };

    animationRef.current = requestAnimationFrame(renderFrame);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [cameraOn, cameraError, cvReady, isLoading, facingMode, onCardScanned]);

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

      {isLoading || !cvReady ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
          <div className="text-white text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4" />
            <p className="text-lg font-semibold">
              {!cvReady ? "Loading OpenCV..." : "Starting camera..."}
            </p>
          </div>
        </div>
      ) : cameraError ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10 p-6">
          <div className="text-center max-w-sm w-full">
            <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
              <CameraOffIcon className="w-8 h-8 text-red-500" />
            </div>
            <p className="text-red-500 text-lg font-semibold">Camera Error</p>
            <p className="text-red-400 text-sm mt-2">{cameraError}</p>

            {permissionStatus === "denied" && (
              <div className="mt-4 p-4 bg-yellow-500/20 rounded-lg">
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
              className="mt-4 px-6 py-2 bg-white text-black rounded-full font-medium"
            >
              Retry
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/70 pointer-events-none z-10" />

          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-4 z-20">
            <h1 className="text-white text-lg font-semibold tracking-wide">
              Scan Your Card
            </h1>
            <div className="flex gap-2">
              <button
                onClick={() => setCameraOn(false)}
                className="w-11 h-11 rounded-full flex items-center justify-center bg-white/15 text-white backdrop-blur-md"
              >
                <CameraOffIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-10 z-10">
            <motion.div
              animate={{
                borderColor: cardDetected
                  ? "#22c55e"
                  : cardFound
                    ? "#facc15"
                    : "#ffffff80",
                scale: cardDetected ? 1.02 : cardFound ? 1.01 : 1,
              }}
              transition={{ duration: 0.25 }}
              className="w-full max-w-[340px] aspect-[3/5] rounded-2xl border-[3px] border-dashed"
            />
          </div>

          <div className="absolute bottom-10 left-0 right-0 flex flex-col items-center gap-2 px-6 z-20">
            <motion.div
              key={matches}
              initial={{ scale: 0.9, opacity: 0.7 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-black/60 backdrop-blur-md text-white px-4 py-2 rounded-full text-sm flex items-center gap-2"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  cardDetected
                    ? "bg-green-400"
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
          </div>
        </>
      )}
    </div>
  );
};

export default CardScanner;

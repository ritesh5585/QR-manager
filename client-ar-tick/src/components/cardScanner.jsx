// CardScanner.js - Fixed version with proper config handling

import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-hot-toast";
import {
  requestCameraWithFallback,
  getCameraErrorMessage,
  getCameraPermissionStatus,
} from "../utils/cameraHelper";
import { getVideoTrack, isTorchSupported, setTorch } from "../utils/flashlight";
import {
  loadReferenceCard,
  findCard,
  cleanupReference,
} from "../utils/cardMatcher";
import { warpCard } from "../utils/cardWarp";
import {
  computeGlobalThreshold,
  analyzeCheckboxes,
} from "../utils/checkboxDetector";
import { CARD_CONFIG } from "../cards/config";
import DebugOverlay from "./DebugOverlay";

// Simple Icons
const Icon = ({ name, className, ...props }) => {
  const icons = {
    cameraOff: (p) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
        <path d="M1 1l22 22M9.5 5H15l2 2h3a2 2 0 0 1 2 2v9.5M15 15.5A4 4 0 1 1 8 12M3 7v10a2 2 0 0 0 2 2h10" />
      </svg>
    ),
    cameraOn: (p) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
        <path d="M9.5 5H15l2 2h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h3z" />
        <circle cx="12" cy="13" r="3.5" />
      </svg>
    ),
    flashOn: (p) => (
      <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
        <path d="M13 2 3 14h7l-1 8 11-14h-7l1-6z" />
      </svg>
    ),
    flashOff: (p) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
        <path d="M13 2 3 14h7l-1 8 11-14h-7l1-6z" opacity="0.4" />
        <path d="M2 2l20 20" />
      </svg>
    ),
    flip: (p) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
        <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
        <path d="M8 12l4-4 4 4" />
        <path d="M12 8v12" />
      </svg>
    ),
  };
  const IconComponent = icons[name];
  return IconComponent ? <IconComponent className={className} {...props} /> : null;
};

const CONFIG = {
  FRAME_INTERVAL: 100,
  MIN_MATCHES: 25,
  STABLE_FRAMES_REQUIRED: 3,
  CAMERA_TIMEOUT: 10000,
};

// Fixed checkbox positions (used for debug overlay)
const CHECKBOX_POSITIONS = {
  1: { x: 63, y: 460, size: 39 },
  2: { x: 63, y: 610, size: 39 },
  3: { x: 63, y: 760, size: 38 },
};

const CardScanner = ({ onCardScanned, onDebugInfo, qrId, showDebug = true }) => {
  // Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const displayCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const trackRef = useRef(null);
  const animationRef = useRef(null);
  const stableFrames = useRef(0);
  const lastCornersRef = useRef(null);
  const lastDetection = useRef(0);
  const processed = useRef(false);

  // State
  const [state, setState] = useState({
    cameraOn: true,
    torchOn: false,
    torchAvailable: false,
    cameraError: null,
    isLoading: true,
    cvReady: false,
    facingMode: "environment",
    isFlipping: false,
    cardDetected: false,
    cardFound: false,
    matches: 0,
    permissionStatus: "unknown",
  });

  const [debugInfo, setDebugInfo] = useState(null);
  const [showDebugOverlay, setShowDebugOverlay] = useState(showDebug);

  const {
    cameraOn,
    torchOn,
    torchAvailable,
    cameraError,
    isLoading,
    cvReady,
    facingMode,
    isFlipping,
    cardDetected,
    cardFound,
    matches,
    permissionStatus,
  } = state;

  const updateState = useCallback((updates) => setState((prev) => ({ ...prev, ...updates })), []);

  // Load OpenCV
  useEffect(() => {
    if (window.cv?.Mat) {
      updateState({ cvReady: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://docs.opencv.org/4.5.0/opencv.js";
    script.onload = () => {
      if (window.cv) {
        window.cv.onRuntimeInitialized = () => {
          console.log("✅ OpenCV loaded");
          updateState({ cvReady: true });
        };
      }
    };
    script.onerror = () => {
      updateState({ cameraError: "OpenCV library failed to load", isLoading: false });
    };
    document.head.appendChild(script);
  }, [updateState]);

  // Load reference card
  useEffect(() => {
    if (!cvReady) return;
    const loadRef = async () => {
      try {
        const loaded = await loadReferenceCard(window.cv, CARD_CONFIG.referenceImage);
        if (loaded) console.log("✅ Reference card loaded");
        else toast.error("Failed to load reference card image");
      } catch (err) {
        console.error("❌ Error loading reference:", err);
      }
    };
    loadRef();
    return () => cleanupReference();
  }, [cvReady]);

  // Permission check
  useEffect(() => {
    const checkPermission = async () => {
      try {
        const status = await getCameraPermissionStatus();
        updateState({ permissionStatus: status });
        if (status === "denied") {
          updateState({ cameraError: "Camera access blocked. Please enable in browser settings." });
        }
      } catch (err) {}
    };
    checkPermission();
  }, [updateState]);

  // Camera start
  const startCamera = useCallback(async () => {
    try {
      updateState({ isLoading: true, cameraError: null });
      const stream = await requestCameraWithFallback(facingMode);
      streamRef.current = stream;
      const track = getVideoTrack(stream);
      trackRef.current = track;
      updateState({ torchAvailable: isTorchSupported(track) });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute("playsinline", "true");
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(reject, CONFIG.CAMERA_TIMEOUT);
          videoRef.current.onloadedmetadata = () => {
            clearTimeout(timeout);
            resolve();
          };
          videoRef.current.onerror = reject;
        });
        await videoRef.current.play();
        console.log("📷 Camera started");
        updateState({ isLoading: false });
      }
    } catch (err) {
      updateState({ cameraError: getCameraErrorMessage(err), isLoading: false });
      toast.error(getCameraErrorMessage(err));
    }
  }, [facingMode, updateState]);

  useEffect(() => {
    if (cameraOn) {
      const timer = setTimeout(startCamera, 300);
      return () => clearTimeout(timer);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
  }, [cameraOn, startCamera]);

  const toggleTorch = useCallback(async () => {
    if (!torchAvailable) return;
    const next = !torchOn;
    const ok = await setTorch(trackRef.current, next);
    if (ok) updateState({ torchOn: next });
  }, [torchOn, torchAvailable, updateState]);

  const flipCamera = useCallback(async () => {
    if (isFlipping) return;
    updateState({ isFlipping: true });
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    const newFacingMode = facingMode === "environment" ? "user" : "environment";
    updateState({ facingMode: newFacingMode });
    await startCamera();
    updateState({ isFlipping: false });
  }, [facingMode, isFlipping, startCamera, updateState]);

  const isCornerStable = useCallback((prevCorners, newCorners, maxDisplacement = 40) => {
    if (!prevCorners || !newCorners || prevCorners.length !== 4 || newCorners.length !== 4) return false;
    for (let i = 0; i < 4; i++) {
      const dist = Math.hypot(newCorners[i].x - prevCorners[i].x, newCorners[i].y - prevCorners[i].y);
      if (dist > maxDisplacement) return false;
    }
    return true;
  }, []);

  // ============================================================
  // DETECTION PIPELINE
  // ============================================================
  const processCard = useCallback((cv, canvas, result) => {
    try {
      console.log("🔄 Processing detected card...");
      const srcMat = cv.imread(canvas);

      const warped = warpCard(cv, srcMat, result.corners, CARD_CONFIG.cardWidth, CARD_CONFIG.cardHeight);
      if (!warped || warped.empty()) {
        console.error("❌ Failed to warp card");
        processed.current = false;
        stableFrames.current = 0;
        lastCornersRef.current = null;
        updateState({ cardDetected: false });
        srcMat.delete();
        return;
      }

      console.log("✅ Card warped successfully");

      const globalThreshold = computeGlobalThreshold(cv, warped);
      console.log("🎚️ Global threshold:", globalThreshold);

      const analysis = analyzeCheckboxes(cv, warped, CARD_CONFIG, globalThreshold, true);
      console.log("📊 Detection results:", analysis);

      let cardImageData = null;
      try {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = CARD_CONFIG.cardWidth;
        tempCanvas.height = CARD_CONFIG.cardHeight;
        cv.imshow(tempCanvas, warped);
        cardImageData = tempCanvas.toDataURL("image/jpeg", 0.9);
        tempCanvas.remove();
      } catch (e) {
        console.error("❌ Could not create card image:", e);
      }

      // Build checkbox ROIs for debug - use fixed positions
      const checkboxROIs = Object.entries(CHECKBOX_POSITIONS).map(([number, pos]) => ({
        number: parseInt(number),
        x: pos.x / CARD_CONFIG.cardWidth,
        y: pos.y / CARD_CONFIG.cardHeight,
        width: pos.size / CARD_CONFIG.cardWidth,
        height: pos.size / CARD_CONFIG.cardHeight,
      }));

      const debugData = {
        checkboxes: analysis.results,
        warpedImage: cardImageData,
        checkboxROIs: checkboxROIs,
        imageSize: { width: canvas.width, height: canvas.height },
        warpedSize: { width: CARD_CONFIG.cardWidth, height: CARD_CONFIG.cardHeight },
        globalThreshold,
        baseline: analysis.baseline,
        margin: analysis.margin || CARD_CONFIG.detection?.margin || 12,
      };

      setDebugInfo(debugData);
      if (onDebugInfo) onDebugInfo(debugData);

      if (analysis.checkedCount > 0) {
        console.log("✅ Checked boxes:", analysis.checkedBoxes);
        if (onCardScanned) {
          // Pass the full results of checked boxes
          const checkedResults = analysis.results.filter((r) => r.isChecked);
          onCardScanned(checkedResults, cardImageData, debugData);
        }
        toast.success(`Detected ${analysis.checkedCount} option(s)!`);
        // Reset for next detection after a short delay
        setTimeout(() => {
          processed.current = false;
          stableFrames.current = 0;
          lastCornersRef.current = null;
          updateState({ cardDetected: false });
        }, 1500);
      } else {
        console.log("⚠️ No checkbox detected");
        toast("No options detected", { icon: "💡" });
        setTimeout(() => {
          processed.current = false;
          stableFrames.current = 0;
          lastCornersRef.current = null;
          updateState({ cardDetected: false });
        }, 1000);
      }

      if (analysis.debugImage) analysis.debugImage.delete();
      warped.delete();
      srcMat.delete();
    } catch (err) {
      console.error("❌ Card processing error:", err);
      processed.current = false;
      stableFrames.current = 0;
      lastCornersRef.current = null;
      updateState({ cardDetected: false });
      toast.error("Failed to process card: " + err.message);
    }
  }, [onCardScanned, onDebugInfo, updateState]);

  // Detect card in frame
  const detectCard = useCallback((ctx, canvas) => {
    try {
      const cv = window.cv;
      const src = cv.imread(canvas);
      const result = findCard(cv, src);
      if (result && result.found && result.matches >= CONFIG.MIN_MATCHES) {
        updateState({ matches: result.matches, cardFound: true });
        const cornersStable = isCornerStable(lastCornersRef.current, result.corners);
        lastCornersRef.current = result.corners;
        stableFrames.current = cornersStable ? stableFrames.current + 1 : 1;
        updateState({ cardDetected: stableFrames.current >= CONFIG.STABLE_FRAMES_REQUIRED });
        if (stableFrames.current >= CONFIG.STABLE_FRAMES_REQUIRED && !processed.current) {
          processed.current = true;
          console.log("🎯 Card steady and detected! Processing...");
          processCard(cv, canvas, result);
        }
      } else {
        updateState({ matches: result?.matches || 0, cardFound: false, cardDetected: false });
        stableFrames.current = 0;
        lastCornersRef.current = null;
        processed.current = false;
      }
      src.delete();
    } catch (err) {
      console.error("Detection error:", err);
      processed.current = false;
    }
  }, [isCornerStable, processCard, updateState]);

  // Main render loop
  useEffect(() => {
    if (!cameraOn || cameraError || !streamRef.current || isLoading || !cvReady) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const displayCanvas = displayCanvasRef.current;
    if (!video || !canvas || !displayCanvas) return;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const displayCtx = displayCanvas.getContext("2d", { willReadFrequently: true });

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
        [canvas, displayCanvas].forEach((c) => {
          if (c.width !== vw || c.height !== vh) {
            c.width = vw;
            c.height = vh;
          }
        });
        if (facingMode === "user") {
          displayCtx.save();
          displayCtx.scale(-1, 1);
          displayCtx.drawImage(video, -vw, 0, vw, vh);
          displayCtx.restore();
        } else {
          displayCtx.drawImage(video, 0, 0, vw, vh);
        }
        ctx.drawImage(displayCanvas, 0, 0);
        const now = Date.now();
        if (now - lastDetection.current >= CONFIG.FRAME_INTERVAL && cvReady && !processed.current) {
          lastDetection.current = now;
          detectCard(ctx, canvas);
        }

        // Draw overlay
        const boxW = Math.min(vw * 0.8, 400);
        const boxH = boxW * 1.4;
        const x = (vw - boxW) / 2;
        const y = (vh - boxH) / 2;
        const color = cardDetected ? "#22c55e" : cardFound ? "#facc15" : "rgba(255,255,255,0.3)";
        
        displayCtx.strokeStyle = color;
        displayCtx.lineWidth = cardDetected ? 4 : 3;
        displayCtx.setLineDash([10, 10]);
        displayCtx.strokeRect(x, y, boxW, boxH);
        displayCtx.setLineDash([]);

        const cornerSize = 30;
        displayCtx.strokeStyle = cardDetected ? "#22c55e" : cardFound ? "#facc15" : "#ffffff80";
        displayCtx.lineWidth = 4;
        const corners = [
          [x, y, x + cornerSize, y],
          [x + boxW - cornerSize, y, x + boxW, y],
          [x, y + boxH - cornerSize, x, y + boxH],
          [x + boxW - cornerSize, y + boxH, x + boxW, y + boxH],
        ];
        corners.forEach(([x1, y1, x2, y2]) => {
          displayCtx.beginPath();
          displayCtx.moveTo(x1, y1);
          displayCtx.lineTo(x2, y2);
          displayCtx.stroke();
        });

        let statusText = "";
        let statusColor = "";
        if (cardDetected) {
          statusText = "✅ Card Detected";
          statusColor = "#22c55e";
        } else if (cardFound) {
          statusText = `🔍 ${matches} matches found`;
          statusColor = "#facc15";
        } else {
          statusText = "Place card in frame";
          statusColor = "rgba(255,255,255,0.5)";
        }
        displayCtx.fillStyle = statusColor;
        displayCtx.font = cardDetected ? "bold 14px sans-serif" : "14px sans-serif";
        displayCtx.textAlign = "center";
        displayCtx.fillText(statusText, vw / 2, y - 20);

        animationRef.current = requestAnimationFrame(renderFrame);
      } catch (err) {
        console.error("Render error:", err);
        animationRef.current = requestAnimationFrame(renderFrame);
      }
    };
    animationRef.current = requestAnimationFrame(renderFrame);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [cameraOn, cameraError, cvReady, isLoading, facingMode, detectCard, cardDetected, cardFound, matches]);

  // UI render
  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <video ref={videoRef} playsInline autoPlay muted className="hidden" />
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <canvas ref={displayCanvasRef} className="absolute inset-0 w-full h-full object-contain" style={{ backgroundColor: "#000" }} />

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
                {!cvReady ? "Downloading..." : "Please allow camera access"}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {cameraError && (
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10 p-6"
        >
          <div className="text-center max-w-sm w-full">
            <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
              <Icon name="cameraOff" className="w-10 h-10 text-red-500" />
            </div>
            <h2 className="text-white text-xl font-bold mb-2">Camera Error</h2>
            <p className="text-red-400 text-sm">{cameraError}</p>
            {permissionStatus === "denied" && (
              <div className="mt-4 p-4 bg-yellow-500/20 rounded-lg border border-yellow-500/30">
                <p className="text-yellow-400 text-sm">Enable camera in browser settings.</p>
              </div>
            )}
            <button
              onClick={() => {
                updateState({ cameraError: null });
                startCamera();
              }}
              className="mt-6 px-8 py-3 bg-white text-black rounded-full font-medium hover:bg-gray-200 transition"
            >
              Retry
            </button>
          </div>
        </motion.div>
      )}

      {!cameraError && cameraOn && !isLoading && cvReady && (
        <>
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/70 pointer-events-none z-10" />
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-4 z-20">
            <div>
              <h1 className="text-white text-lg font-semibold tracking-wide drop-shadow-lg">Scan Your Card</h1>
              <p className="text-gray-300 text-xs mt-1 opacity-80">
                {qrId ? `QR: ${qrId}` : "Place card in frame"}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={flipCamera}
                disabled={isFlipping}
                className="w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md bg-white/20 text-white hover:bg-white/30 transition-all disabled:opacity-50 border border-white/10"
              >
                <Icon name="flip" className="w-5 h-5" />
              </button>
              {torchAvailable && (
                <button
                  onClick={toggleTorch}
                  className={`w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md transition-all border border-white/10 ${
                    torchOn ? "bg-yellow-400 text-black" : "bg-white/20 text-white hover:bg-white/30"
                  }`}
                >
                  {torchOn ? <Icon name="flashOn" className="w-5 h-5" /> : <Icon name="flashOff" className="w-5 h-5" />}
                </button>
              )}
              <button
                onClick={() => updateState({ cameraOn: false })}
                className="w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-md bg-white/20 text-white hover:bg-white/30 transition-all border border-white/10"
              >
                <Icon name="cameraOff" className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-10 z-10">
            <motion.div
              animate={{
                borderColor: cardDetected ? "#22c55e" : cardFound ? "#facc15" : "rgba(255,255,255,0.4)",
                scale: cardDetected ? 1.02 : cardFound ? 1.01 : 1,
                boxShadow: cardDetected
                  ? "0 0 60px rgba(34,197,94,0.3)"
                  : cardFound
                  ? "0 0 40px rgba(250,204,21,0.2)"
                  : "none",
              }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-[340px] aspect-[3/5] rounded-2xl border-[3px] border-dashed"
            />
          </div>
          <div className="absolute bottom-10 left-0 right-0 flex flex-col items-center gap-3 px-6 z-20">
            <motion.div
              key={matches}
              initial={{ scale: 0.9, opacity: 0.7 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-black/60 backdrop-blur-xl text-white px-6 py-3 rounded-full text-sm flex items-center gap-3 border border-white/10"
            >
              <span
                className={`w-3 h-3 rounded-full ${
                  cardDetected ? "bg-green-400 animate-pulse" : cardFound ? "bg-yellow-400 animate-pulse" : "bg-red-400 animate-pulse"
                }`}
              />
              {cardDetected
                ? "✅ Card detected! Processing..."
                : cardFound
                ? `Hold steady... (${matches} matches)`
                : `Position card in frame (${matches} matches)`}
            </motion.div>
            {cardFound && !cardDetected && (
              <div className="w-48 h-1 bg-white/20 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-yellow-400 rounded-full"
                  initial={{ width: "0%" }}
                  animate={{ width: `${Math.min((stableFrames.current / CONFIG.STABLE_FRAMES_REQUIRED) * 100, 100)}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            )}
          </div>
        </>
      )}

      {!cameraOn && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 flex flex-col items-center justify-center bg-black z-10"
        >
          <div className="text-center">
            <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-6">
              <Icon name="cameraOn" className="w-10 h-10 text-white/70" />
            </div>
            <h2 className="text-white text-xl font-semibold mb-2">Camera is Off</h2>
            <p className="text-gray-400 text-sm mb-6">Turn on the camera to start scanning</p>
            <button
              onClick={() => {
                updateState({ cameraOn: true, isLoading: true });
                startCamera();
              }}
              className="px-8 py-3 bg-white text-black rounded-full font-medium hover:bg-gray-200 transition"
            >
              Turn Camera On
            </button>
          </div>
        </motion.div>
      )}

      {showDebugOverlay && debugInfo && (
        <DebugOverlay
          debugInfo={debugInfo}
          onClose={() => setShowDebugOverlay(false)}
          onUpdateConfig={() => {}}
          onDynamicAdjust={() => {}}
          isDynamicMode={false}
        />
      )}
    </div>
  );
};

export default CardScanner;
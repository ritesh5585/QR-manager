// CardScanner.jsx - Fixed Flashlight Popup Behavior

import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-hot-toast";
import { useNavigate } from "react-router-dom";
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

// ============================================================
// ICONS
// ============================================================
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
    close: (p) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    ),
    brightness: (p) => (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...p}>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    ),
  };
  const IconComponent = icons[name];
  return IconComponent ? <IconComponent className={className} {...props} /> : null;
};

// ============================================================
// POPUP COMPONENTS
// ============================================================

const ScanAgainPopup = ({ message, onClose }) => {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-gray-900 rounded-lg p-8 max-w-md w-[90%] text-center shadow-2xl border border-gray-700"
      >
        <div className="text-6xl mb-4">📷</div>
        <h2 className="text-2xl font-bold text-white mb-2">Scan Again</h2>
        <p className="text-gray-400 mb-6">{message}</p>
        <button
          onClick={() => {
            onClose();
            navigate("/");
          }}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          Scan Again
        </button>
      </motion.div>
    </div>
  );
};

const CardNotFoundPopup = ({ onClose }) => {
  const navigate = useNavigate();

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-gray-900 rounded-lg p-8 max-w-md w-full text-center shadow-2xl border border-gray-700"
      >
        <button
          onClick={() => {
            onClose();
            navigate("/");
          }}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          Scan Again
        </button>
      </motion.div>
    </div>
  );
};

const FlashlightRequiredPopup = ({ onClose, onEnableFlash }) => {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[100]">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-gray-900 rounded-lg p-8 max-w-md w-full text-center shadow-2xl border border-gray-700"
      >
        <div className="text-6xl mb-4">🔦</div>
        <h2 className="text-2xl font-bold text-white mb-2">Low Light Detected</h2>
        <p className="text-gray-400 mb-6">
          The environment is too dark. Please turn on the flashlight for better detection.
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => {
              onEnableFlash();
              onClose();
            }}
            className="px-6 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors font-medium flex items-center justify-center gap-2"
          >
            <Icon name="flashOn" className="w-5 h-5" />
            Turn On Flashlight
          </button>
          <button
            onClick={() => {
              onClose();
            }}
            className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
          >
            Continue Anyway
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ============================================================
// CONFIG
// ============================================================
const CONFIG = {
  FRAME_INTERVAL: 150,
  MIN_MATCHES: 20,
  STABLE_FRAMES_REQUIRED: 2,
  CAMERA_TIMEOUT: 10000,
  PROCESSING_COOLDOWN: 3000,
  DARKNESS_THRESHOLD: 80,
  CARD_NOT_FOUND_TIMEOUT: 5000,
};

// ============================================================
// MAIN COMPONENT
// ============================================================
const CardScanner = ({ onCardScanned, qrId, onClose }) => {
  const navigate = useNavigate();

  // ============================================================
  // REFS
  // ============================================================
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
  const cooldownUntil = useRef(0);
  const detectionTimeoutRef = useRef(null);
  const brightnessCheckRef = useRef(null);
  const flashlightDismissedRef = useRef(false); // Track if flashlight popup was dismissed

  // ============================================================
  // STATE
  // ============================================================
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
    isDark: false,
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [showPopup, setShowPopup] = useState(false);
  const [popupMessage, setPopupMessage] = useState("");
  const [showCardNotFoundPopup, setShowCardNotFoundPopup] = useState(false);
  const [showFlashlightPopup, setShowFlashlightPopup] = useState(false);
  const [isDarkDetected, setIsDarkDetected] = useState(false);

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
    isDark,
  } = state;

  const updateState = useCallback(
    (updates) => setState((prev) => ({ ...prev, ...updates })),
    [],
  );

  // ============================================================
  // HELPER FUNCTIONS
  // ============================================================
  const resetState = useCallback(() => {
    processed.current = false;
    stableFrames.current = 0;
    lastCornersRef.current = null;
    updateState({ cardDetected: false });

    if (detectionTimeoutRef.current) {
      clearTimeout(detectionTimeoutRef.current);
      detectionTimeoutRef.current = null;
    }
  }, [updateState]);

  const showPopupMessage = useCallback((message) => {
    setPopupMessage(message);
    setShowPopup(true);
  }, []);

  const closePopup = useCallback(() => {
    setShowPopup(false);
    resetState();
    setIsProcessing(false);
  }, [resetState]);

  const closeCardNotFoundPopup = useCallback(() => {
    setShowCardNotFoundPopup(false);
    resetState();
    setIsProcessing(false);
    // Reset flashlight dismissal when scan again is clicked
    flashlightDismissedRef.current = false;
  }, [resetState]);

  const closeFlashlightPopup = useCallback(() => {
    setShowFlashlightPopup(false);
    // Mark flashlight as dismissed so it won't show again
    flashlightDismissedRef.current = true;
  }, []);

  const generateCardImage = useCallback((cv, warped) => {
    try {
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = CARD_CONFIG.cardWidth;
      tempCanvas.height = CARD_CONFIG.cardHeight;
      cv.imshow(tempCanvas, warped);
      const imageData = tempCanvas.toDataURL("image/jpeg", 0.9);
      tempCanvas.remove();
      return imageData;
    } catch (e) {
      console.error("❌ Could not create card image:", e);
      return null;
    }
  }, []);

  const cleanupResources = useCallback((warped, srcMat, analysis) => {
    if (analysis?.debugImage) analysis.debugImage.delete();
    if (warped) warped.delete();
    if (srcMat) srcMat.delete();
  }, []);

  // ============================================================
  // PROCESS CARD
  // ============================================================
  const processCard = useCallback(
    (cv, canvas, result) => {
      if (isProcessing) return;
      setIsProcessing(true);
      cooldownUntil.current = Date.now() + CONFIG.PROCESSING_COOLDOWN;

      try {
        console.log("🔄 Processing detected card...");
        const srcMat = cv.imread(canvas);
        const warped = warpCard(
          cv,
          srcMat,
          result.corners,
          CARD_CONFIG.cardWidth,
          CARD_CONFIG.cardHeight,
        );

        if (!warped || warped.empty()) {
          console.error("❌ Failed to warp card");
          if (srcMat) srcMat.delete();
          resetState();
          setIsProcessing(false);
          showPopupMessage("Failed to detect card. Please try again.");
          return;
        }

        const globalThreshold = computeGlobalThreshold(cv, warped);
        const analysis = analyzeCheckboxes(
          cv,
          warped,
          CARD_CONFIG,
          globalThreshold,
          false,
        );
        console.log("📊 Detection:", analysis);

        const cardImageData = generateCardImage(cv, warped);

        if (analysis.checkedCount > 0 && !analysis.isEmpty) {
          console.log("✅ Checked boxes:", analysis.checkedBoxes);
          if (onCardScanned) {
            const checkedResults = analysis.results.filter((r) => r.isChecked);
            onCardScanned(checkedResults, cardImageData);
          }
          setTimeout(() => {
            resetState();
            setIsProcessing(false);
          }, CONFIG.PROCESSING_COOLDOWN);
        } else {
          const message = analysis.isEmpty
            ? "No options selected on this card."
            : "No options detected. Please try again.";
          showPopupMessage(message);
          setTimeout(() => {
            resetState();
            setIsProcessing(false);
          }, 1500);
        }

        cleanupResources(warped, srcMat, analysis);
      } catch (err) {
        console.error("❌ Card processing error:", err);
        resetState();
        setIsProcessing(false);
        showPopupMessage("An error occurred while processing the card.");
      }
    },
    [
      isProcessing,
      resetState,
      showPopupMessage,
      generateCardImage,
      cleanupResources,
      onCardScanned,
    ],
  );

  // ============================================================
  // BRIGHTNESS / DARKNESS DETECTION
  // ============================================================
  const checkBrightness = useCallback((imageData) => {
    const data = imageData.data;
    let totalBrightness = 0;
    const pixels = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const brightness = (r + g + b) / 3;
      totalBrightness += brightness;
    }

    const avgBrightness = totalBrightness / pixels;
    const isDark = avgBrightness < CONFIG.DARKNESS_THRESHOLD;

    return { avgBrightness, isDark };
  }, []);

  // ============================================================
  // DETECTION
  // ============================================================
  const isCornerStable = useCallback(
    (prevCorners, newCorners, maxDisplacement = 40) => {
      if (
        !prevCorners ||
        !newCorners ||
        prevCorners.length !== 4 ||
        newCorners.length !== 4
      )
        return false;
      for (let i = 0; i < 4; i++) {
        const dist = Math.hypot(
          newCorners[i].x - prevCorners[i].x,
          newCorners[i].y - prevCorners[i].y,
        );
        if (dist > maxDisplacement) return false;
      }
      return true;
    },
    [],
  );

  const detectCard = useCallback(
    (ctx, canvas) => {
      if (Date.now() < cooldownUntil.current || isProcessing) return;

      try {
        const cv = window.cv;
        const src = cv.imread(canvas);
        const result = findCard(cv, src);

        // Check brightness if card not found
        if (!result || !result.found || result.matches < CONFIG.MIN_MATCHES) {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const { isDark, avgBrightness } = checkBrightness(imageData);

          // Show flashlight popup only if:
          // 1. It's dark
          // 2. Flashlight is not on
          // 3. Flashlight popup hasn't been dismissed
          // 4. No other popup is showing
          // 5. Card not found popup is not showing
          if (
            isDark && 
            !torchOn && 
            !flashlightDismissedRef.current && 
            !showFlashlightPopup &&
            !showCardNotFoundPopup &&
            !showPopup
          ) {
            setIsDarkDetected(true);
            setShowFlashlightPopup(true);
          } else {
            setIsDarkDetected(false);
          }

          updateState({
            matches: result?.matches || 0,
            cardFound: false,
            cardDetected: false,
            isDark: isDark,
          });
          stableFrames.current = 0;
          lastCornersRef.current = null;
          processed.current = false;

          // Show card not found popup after timeout
          if (!detectionTimeoutRef.current && !showCardNotFoundPopup) {
            detectionTimeoutRef.current = setTimeout(() => {
              setShowCardNotFoundPopup(true);
              detectionTimeoutRef.current = null;
            }, CONFIG.CARD_NOT_FOUND_TIMEOUT);
          }
        } else {
          // Card found - clear timeout and popup
          if (detectionTimeoutRef.current) {
            clearTimeout(detectionTimeoutRef.current);
            detectionTimeoutRef.current = null;
          }
          if (showCardNotFoundPopup) {
            setShowCardNotFoundPopup(false);
          }

          updateState({
            matches: result.matches,
            cardFound: true,
            isDark: false,
          });
          const cornersStable = isCornerStable(
            lastCornersRef.current,
            result.corners,
          );
          lastCornersRef.current = result.corners;
          stableFrames.current = cornersStable ? stableFrames.current + 1 : 1;
          updateState({
            cardDetected: stableFrames.current >= CONFIG.STABLE_FRAMES_REQUIRED,
          });

          if (
            stableFrames.current >= CONFIG.STABLE_FRAMES_REQUIRED &&
            !processed.current
          ) {
            processed.current = true;
            console.log("🎯 Card detected! Processing...");
            processCard(cv, canvas, result);
          }
        }
        src.delete();
      } catch (err) {
        console.error("Detection error:", err);
        processed.current = false;
      }
    },
    [
      isCornerStable,
      processCard,
      updateState,
      isProcessing,
      checkBrightness,
      torchOn,
      showFlashlightPopup,
      showCardNotFoundPopup,
      showPopup,
    ],
  );

  // ============================================================
  // LIFECYCLE
  // ============================================================

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
      updateState({
        cameraError: "OpenCV library failed to load",
        isLoading: false,
      });
    };
    document.head.appendChild(script);
  }, [updateState]);

  // Load reference card
  useEffect(() => {
    if (!cvReady) return;
    const loadRef = async () => {
      try {
        const loaded = await loadReferenceCard(
          window.cv,
          CARD_CONFIG.referenceImage,
        );
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
          updateState({
            cameraError:
              "Camera access blocked. Please enable in browser settings.",
          });
        }
      } catch (err) {}
    };
    checkPermission();
  }, [updateState]);

  // Start Camera
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
      updateState({
        cameraError: getCameraErrorMessage(err),
        isLoading: false,
      });
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
    if (ok) {
      updateState({ torchOn: next });
      if (next) {
        setShowFlashlightPopup(false);
        setIsDarkDetected(false);
        flashlightDismissedRef.current = true; // Mark as dismissed after enabling
      }
    }
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

  // Clear timeouts on unmount
  useEffect(() => {
    return () => {
      if (detectionTimeoutRef.current) {
        clearTimeout(detectionTimeoutRef.current);
      }
      if (brightnessCheckRef.current) {
        clearTimeout(brightnessCheckRef.current);
      }
    };
  }, []);

  // Reset flashlight dismissal when scan again popup appears
  useEffect(() => {
    if (showPopup || showCardNotFoundPopup) {
      flashlightDismissedRef.current = false;
    }
  }, [showPopup, showCardNotFoundPopup]);

  // ============================================================
  // RENDER LOOP
  // ============================================================
  useEffect(() => {
    if (!cameraOn || cameraError || !streamRef.current || isLoading || !cvReady)
      return;
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
        if (
          now - lastDetection.current >= CONFIG.FRAME_INTERVAL &&
          cvReady &&
          !processed.current
        ) {
          lastDetection.current = now;
          detectCard(ctx, canvas);
        }

        // Draw guide overlay (transparent border)
        const boxW = Math.min(vw * 0.8, 400);
        const boxH = boxW * 1.4;
        const x = (vw - boxW) / 2;
        const y = (vh - boxH) / 2;
        const color = "transparent";

        displayCtx.strokeStyle = color;
        displayCtx.lineWidth = cardDetected ? 4 : 3;
        displayCtx.setLineDash([10, 10]);
        displayCtx.strokeRect(x, y, boxW, boxH);
        displayCtx.setLineDash([]);

        // Corner marks (transparent)
        const cornerSize = 30;
        displayCtx.strokeStyle = "transparent";
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

        // Status text on video
        const statusText = cardDetected
          ? "✅ Card Detected"
          : cardFound
            ? `🔍 ${matches} matches`
            : isDarkDetected
              ? "💡 Low light detected"
              : "";

        if (statusText) {
          displayCtx.fillStyle = cardDetected
            ? "#22c55e"
            : cardFound
              ? "#facc15"
              : isDarkDetected
                ? "#f59e0b"
                : "rgba(255,255,255,0.5)";
          displayCtx.font = cardDetected
            ? "bold 14px sans-serif"
            : "14px sans-serif";
          displayCtx.textAlign = "center";
          displayCtx.fillText(statusText, vw / 2, y - 20);
        }

        // "Bring card closer" message when not detected
        if (
          !cardFound &&
          !cardDetected &&
          !isProcessing &&
          !showCardNotFoundPopup
        ) {
          displayCtx.fillStyle = "rgba(255, 255, 255, 0.4)";
          displayCtx.font = "14px sans-serif";
          displayCtx.textAlign = "center";
          displayCtx.fillText(
            " Bring card closer to camera",
            vw / 2,
            vh / 2 + 60,
          );
        }

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
  }, [
    cameraOn,
    cameraError,
    cvReady,
    isLoading,
    facingMode,
    detectCard,
    cardDetected,
    cardFound,
    matches,
    isDarkDetected,
    isProcessing,
    showCardNotFoundPopup,
  ]);

  // ============================================================
  // UI RENDER
  // ============================================================
  return (
    <>
      <div className="fixed inset-0 overflow-hidden z-50 bg-black">
        <video ref={videoRef} playsInline autoPlay muted className="hidden" />
        <canvas ref={canvasRef} style={{ display: "none" }} />
        <canvas
          ref={displayCanvasRef}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ backgroundColor: "transparent" }}
        />

        {/* Torch */}
        <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
          {torchAvailable && (
            <button
              onClick={toggleTorch}
              className="p-3 bg-black/50 rounded-full hover:bg-black/70 transition-colors text-white"
            >
              <Icon
                name={torchOn ? "flashOn" : "flashOff"}
                className="w-5 h-5"
              />
            </button>
          )}
        </div>

        {/* Loading */}
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
                  <Icon name="cameraOff" className="w-10 h-10 text-red-500" />
                </div>
                <h2 className="text-white text-xl font-bold mb-2">
                  Camera Error
                </h2>
                <p className="text-red-400 text-sm">{cameraError}</p>
                {permissionStatus === "denied" && (
                  <div className="mt-4 p-4 bg-yellow-500/20 rounded-lg border border-yellow-500/30">
                    <p className="text-yellow-400 text-sm">
                      Enable camera in browser settings.
                    </p>
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
        </AnimatePresence>

        {/* Active Camera Status */}
        {!cameraError && cameraOn && !isLoading && cvReady && (
          <>
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
                        : isDarkDetected
                          ? "bg-yellow-500 animate-pulse"
                          : "bg-red-400 animate-pulse"
                  }`}
                />
                {cardDetected
                  ? "✅ Card detected! Processing..."
                  : cardFound
                    ? `Hold steady... (${matches} matches)`
                    : isDarkDetected
                      ? "💡 Low light - Use flashlight"
                      : "Position card in frame"}
              </motion.div>

              {cardFound && !cardDetected && (
                <div className="w-48 h-1 bg-white/20 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-yellow-400 rounded-full"
                    initial={{ width: "0%" }}
                    animate={{
                      width: `${Math.min(
                        (stableFrames.current / CONFIG.STABLE_FRAMES_REQUIRED) *
                          100,
                        100,
                      )}%`,
                    }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              )}

              {isProcessing && (
                <div className="bg-blue-600/80 backdrop-blur-xl text-white px-4 py-2 rounded-lg text-xs border border-white/10">
                  ⏳ Processing card...
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Scan Again Popup */}
      <AnimatePresence>
        {showPopup && (
          <ScanAgainPopup message={popupMessage} onClose={closePopup} />
        )}
      </AnimatePresence>

      {/* Card Not Found Popup */}
      <AnimatePresence>
        {showCardNotFoundPopup && (
          <CardNotFoundPopup onClose={closeCardNotFoundPopup} />
        )}
      </AnimatePresence>

      {/* Flashlight Required Popup */}
      <AnimatePresence>
        {showFlashlightPopup && (
          <FlashlightRequiredPopup
            onClose={closeFlashlightPopup}
            onEnableFlash={toggleTorch}
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default CardScanner;
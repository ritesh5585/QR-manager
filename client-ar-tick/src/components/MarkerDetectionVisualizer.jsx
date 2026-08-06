import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  detectCornerBlocks,
  orderBlocksForDocument,
  isPlausibleCard,
  cornersAreStable,
} from "../utils/cornerBlockDetector";
import { getVideoTrack, isTorchSupported, setTorch } from "../utils/flashlight";
import { getAverageBrightness, isDark } from "../utils/lightLevel";

// ---- Small inline icons (unchanged from before) ----
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

// ---- Performance knobs — tuned for fast detection ----
const DETECTION_INTERVAL_MS = 70; // ~14 detections/sec for fast responsiveness
const DETECTION_WIDTH = 320; // analyze at this width; scaled back up for the real warp

const MarkerDetectionVisualizer = ({ onFourMarkersDetected }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const trackRef = useRef(null);

  const [croppedImage, setCroppedImage] = useState(null);
  const [cameraOn, setCameraOn] = useState(true);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [dark, setDark] = useState(false);
  const [markersFound, setMarkersFound] = useState(0);
  const [locking, setLocking] = useState(false);

  const toggleTorch = useCallback(async () => {
    const next = !torchOn;
    const ok = await setTorch(trackRef.current, next);
    if (ok) setTorchOn(next);
  }, [torchOn]);

  useEffect(() => {
    if (!cameraOn) return;

    if (!window.cv) {
      console.error(
        "❌ OpenCV not loaded. Make sure scripts are included in index.html",
      );
      return;
    }

    const cv = window.cv;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    // willReadFrequently: true — hints the browser to use a faster readback
    // path, since cv.imread() reads this canvas's pixels every detection tick.
    const context = canvas.getContext("2d", { willReadFrequently: true });

    // Reused small offscreen canvas — created once, not every frame.
    const smallCanvas = document.createElement("canvas");
    const smallContext = smallCanvas.getContext("2d", {
      willReadFrequently: true,
    });

    let cancelled = false;
    let rafId = null;
    let frameCount = 0;
    let lastDetectionTime = 0;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 960 },
          },
        });

        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        const track = getVideoTrack(stream);
        trackRef.current = track;
        setTorchAvailable(isTorchSupported(track));

        video.srcObject = stream;
        await video.play();
      } catch (err) {
        console.error("Camera Error", err);
      }
    };

    const getWarpedImage = (srcCanvas, corners) => {
      const srcMat = cv.imread(srcCanvas);
      const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, corners.flat());

      const width = 480;
      const height = 800;

      const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
        0,
        0,
        width,
        0,
        width,
        height,
        0,
        height,
      ]);

      const M = cv.getPerspectiveTransform(srcTri, dstTri);
      const dst = new cv.Mat();
      const dsize = new cv.Size(width, height);
      cv.warpPerspective(
        srcMat,
        dst,
        M,
        dsize,
        cv.INTER_LINEAR,
        cv.BORDER_CONSTANT,
        new cv.Scalar(),
      );

      const resultCanvas = document.createElement("canvas");
      resultCanvas.width = width;
      resultCanvas.height = height;
      cv.imshow(resultCanvas, dst);
      const dataUrl = resultCanvas.toDataURL();

      setCroppedImage(dataUrl);
      onFourMarkersDetected && onFourMarkersDetected(dataUrl);

      srcMat.delete();
      dst.delete();
      M.delete();
      srcTri.delete();
      dstTri.delete();
    };

    let processed = false;
    let stableFrames = 0;
    let previousOrdered = null;

    const process = (timestamp) => {
      if (cancelled) return;

      if (!video || video.readyState !== 4) {
        rafId = requestAnimationFrame(process);
        return;
      }

      try {
        // Full-res canvas: drawn EVERY frame — this is what the user sees,
        // stays smooth regardless of detection throttling below.
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // ---- THROTTLE: only run the expensive CV work a few times/sec ----
        const dueForDetection =
          timestamp - lastDetectionTime >= DETECTION_INTERVAL_MS;

        if (dueForDetection) {
          lastDetectionTime = timestamp;

          frameCount += 1;
          if (frameCount % 3 === 0) {
            // darkness check even less often — it's a slow-moving signal
            const brightness = getAverageBrightness(canvas);
            setDark(isDark(brightness));
          }

          // ---- DOWNSCALE: detect on a small copy, not the full frame ----
          const scale = DETECTION_WIDTH / canvas.width;
          smallCanvas.width = DETECTION_WIDTH;
          smallCanvas.height = Math.round(canvas.height * scale);
          smallContext.drawImage(
            canvas,
            0,
            0,
            smallCanvas.width,
            smallCanvas.height,
          );

          const srcMat = cv.imread(smallCanvas);
          const blocks = detectCornerBlocks(cv, srcMat);
          srcMat.delete();

          setMarkersFound(blocks.length);

          const ordered =
            blocks.length >= 4 ? orderBlocksForDocument(blocks) : null;

          // ---- VALIDATE: shape must look like a card, AND match last frame ----
          const plausible = ordered && isPlausibleCard(ordered);
          const stableWithPrevious =
            ordered && cornersAreStable(ordered, previousOrdered);

          if (plausible && stableWithPrevious) {
            stableFrames += 1;
          } else {
            stableFrames = 0; // any implausible or jumpy frame resets the count
          }
          previousOrdered = ordered;

          setLocking(stableFrames > 0 && stableFrames < 3);

          if (stableFrames >= 3 && !processed) {
            processed = true;

            // Scale the small-canvas corner coordinates back up to the
            // full-resolution canvas — the warp needs real pixel positions.
            const invScale = 1 / scale;
            const orderedCorners = [
              [
                ordered.topLeft.center.x * invScale,
                ordered.topLeft.center.y * invScale,
              ],
              [
                ordered.topRight.center.x * invScale,
                ordered.topRight.center.y * invScale,
              ],
              [
                ordered.bottomRight.center.x * invScale,
                ordered.bottomRight.center.y * invScale,
              ],
              [
                ordered.bottomLeft.center.x * invScale,
                ordered.bottomLeft.center.y * invScale,
              ],
            ];

            getWarpedImage(canvas, orderedCorners);
          }
        }
      } catch (err) {
        console.error("💥 process() crashed on this frame:", err);
      }

      rafId = requestAnimationFrame(process);
    };

    startCamera().then(() => {
      if (!cancelled) rafId = requestAnimationFrame(process);
    });

    return () => {
      cancelled = true;
      if (rafId) cancelAnimationFrame(rafId);

      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      streamRef.current = null;
      trackRef.current = null;
      setTorchAvailable(false);
      setTorchOn(false);
    };
  }, [onFourMarkersDetected, cameraOn]);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      {!croppedImage ? (
        <>
          {cameraOn ? (
            <>
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full object-cover"
              />
              <video
                ref={videoRef}
                playsInline
                autoPlay
                muted
                className="hidden"
              />

              <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/70 pointer-events-none" />

              <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 pt-[env(safe-area-inset-top)] pt-4">
                <h1 className="text-white text-lg font-semibold tracking-wide drop-shadow">
                  Scan Your Card
                </h1>
                <div className="flex gap-2">
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
                    onClick={() => setCameraOn(false)}
                    aria-label="Turn camera off"
                    className="w-11 h-11 rounded-full flex items-center justify-center bg-white/15 text-white backdrop-blur-md"
                  >
                    <CameraOffIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {dark && !torchOn && (
                  <motion.button
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    onClick={torchAvailable ? toggleTorch : undefined}
                    className="absolute top-20 left-1/2 -translate-x-1/2 bg-yellow-400 text-black text-sm font-medium px-4 py-2 rounded-full shadow-lg flex items-center gap-2"
                  >
                    <FlashOnIcon className="w-4 h-4" />
                    {torchAvailable
                      ? "It's dark — tap to turn on flash"
                      : "Low light detected"}
                  </motion.button>
                )}
              </AnimatePresence>

              <div className="absolute inset-0 flex items-center justify-center pointer-events-none px-10">
                <motion.div
                  animate={{
                    borderColor: locking ? "#facc15" : "#ffffff80",
                    scale: locking ? 1.01 : 1,
                  }}
                  transition={{ duration: 0.25 }}
                  className="w-full max-w-[340px] aspect-[3/5] rounded-2xl border-[3px] border-dashed"
                />
              </div>

              <div className="absolute bottom-10 left-0 right-0 flex flex-col items-center gap-2 px-6">
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
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6">
              <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center">
                <CameraOffIcon className="w-7 h-7 text-white/70" />
              </div>
              <p className="text-white/70 text-sm">Camera is off</p>
              <button
                onClick={() => setCameraOn(true)}
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

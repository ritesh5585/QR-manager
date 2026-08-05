import React, { useEffect, useRef, useState } from "react";
import {
  detectCornerBlocks,
  orderBlocksForDocument,
} from "../utils/cornerBlockDetector";

const MarkerDetectionVisualizer = ({ onFourMarkersDetected }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [croppedImage, setCroppedImage] = useState(null);
  const [videoAspectRatio, setVideoAspectRatio] = useState(4 / 3);

  useEffect(() => {
    if (!window.cv || !window.AR) {
      console.error(
        "❌ OpenCV or ArUco not loaded. Make sure scripts are included in index.html",
      );
      return;
    }
    
    const cv = window.cv;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    let cancelled = false;
    let rafId = null;
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 960 }, // comfortably taller than the 540 the ROI needs
          },
        });

        video.srcObject = stream;

        await video.play();
      } catch (err) {
        console.error("Camera Error", err);
      }
    };

    const getWarpedImage = (srcCanvas, corners) => {
      const srcMat = cv.imread(srcCanvas);
      const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, corners.flat());

      const width = 480; // portrait — matches your actual card's proportions
      const height = 800; // adjust these two based on your card's real aspect ratio

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

      console.log("✅ Warped image ready:", dataUrl.slice(0, 50) + "...");

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

    const process = () => {
      if (cancelled) return;

      if (!video || video.readyState !== 4) {
        rafId = requestAnimationFrame(process);
        return;
      }

      try {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Replace ArUco marker handling with corner-block detection
        const srcMat = cv.imread(canvas);
        const blocks = detectCornerBlocks(cv, srcMat);
        srcMat.delete();

        // draw debug boxes (same idea as before, now using rect instead of marker.corners)
        blocks.forEach((block) => {
          context.strokeStyle = "red";
          context.lineWidth = 3;
          context.strokeRect(
            block.rect.x,
            block.rect.y,
            block.rect.width,
            block.rect.height,
          );
        });

        if (blocks.length >= 4) {
          stableFrames += 1;
        } else {
          stableFrames = 0;
        }

        if (stableFrames >= 6 && !processed) {
          processed = true;

          const ordered = orderBlocksForDocument(blocks);
          if (!ordered) {
            processed = false;
            rafId = requestAnimationFrame(process);
            return;
          }

          const orderedCorners = [
            [ordered.topLeft.center.x, ordered.topLeft.center.y],
            [ordered.topRight.center.x, ordered.topRight.center.y],
            [ordered.bottomRight.center.x, ordered.bottomRight.center.y],
            [ordered.bottomLeft.center.x, ordered.bottomLeft.center.y],
          ];

          getWarpedImage(canvas, orderedCorners); // unchanged, already OpenCV.js-based
        }
      } catch (err) {
        console.error("💥 process() crashed on this frame:", err);
      }

      rafId = requestAnimationFrame(process);
    };

    startCamera().then(() => {
      if (!cancelled) {
        rafId = requestAnimationFrame(process);
      }
    });

    return () => {
      cancelled = true;

      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      console.log(rafId);

      const stream = video?.srcObject;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      console.log(stream);
    };
  }, [onFourMarkersDetected]);

  return (
    <div className="flex flex-col items-center p-4 max-w-md mx-auto bg-[#f3e8d4] h-[100dvh]">
      <h1 className="text-2xl font-bold text-[#046a81]">Scanner</h1>

      {!croppedImage ? (
        <div className="relative w-full" style={{ height: "500px" }}>
          <video
            ref={videoRef}
            playsInline
            autoPlay
            muted
            style={{ display: "none" }}
          />
          <div
            className="absolute inset-0 flex justify-center items-center"
            style={{
              aspectRatio: videoAspectRatio,
              maxWidth: "100%",
              maxHeight: "100%",
              margin: "auto",
            }}
          >
            <canvas
              ref={canvasRef}
              className="w-full h-full object-contain rounded-lg border-2 border-gray-300 shadow-md"
            />
          </div>
          <div className="absolute bottom-0 left-0 right-0 flex justify-center">
            <div className="bg-black bg-opacity-70 text-white px-3 py-1 rounded-full text-sm">
              Align all 4 markers in view
            </div>
          </div>
        </div>
      ) : (
        <div className="w-full">
          <div className="flex justify-center items-center h-full w-auto bg-gray-300 rounded-lg mb-4">
            <img
              src={croppedImage}
              alt="Cropped document"
              className="max-h-full max-w-full object-contain rounded border border-gray-200 shadow-sm"
            />
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-4">
            <div className="w-5 h-5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin"></div>
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

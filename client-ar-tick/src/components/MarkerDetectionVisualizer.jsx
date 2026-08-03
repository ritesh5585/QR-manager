import React, { useEffect, useRef, useState } from "react";

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
    const AR = window.AR;
    const detector = new AR.Detector();

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");

    // FIX: guards against React StrictMode's double-invoke in dev, which was
    // causing "AbortError: play() request was interrupted" — if the effect's
    // cleanup already ran by the time getUserMedia/video.play() resolves, we
    // stop here instead of wiring up a camera/loop for an unmounted component.
    let cancelled = false;
    let rafId = null;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
          },
        });

        if (cancelled) {
          // Component was unmounted while we were waiting for permission —
          // release the camera immediately instead of leaving it open.
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        video.srcObject = stream;
        await video.play();

        // FIX: videoAspectRatio was declared with a setter but never actually
        // updated — it stayed hardcoded at 4/3 forever. Now it reflects the
        // real camera stream's dimensions once they're known.
        if (video.videoWidth && video.videoHeight) {
          setVideoAspectRatio(video.videoWidth / video.videoHeight);
        }
      } catch (err) {
        console.error("Camera Error:", err);
      }
    };

    const getWarpedImage = (srcCanvas, corners) => {
      const srcMat = cv.imread(srcCanvas);
      const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, corners.flat());

      const width = video.videoWidth;
      const height = video.videoHeight;

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

      // FIX: was `console.log("warped image:", getWarpedImage)` — logged the
      // function itself, not the actual cropped result. Now logs the useful
      // value (or remove entirely once you've confirmed it works).
      console.log("✅ Warped image ready:", dataUrl.slice(0, 50) + "...");

      setCroppedImage(dataUrl);
      onFourMarkersDetected && onFourMarkersDetected(dataUrl);

      srcMat.delete();
      dst.delete();
      M.delete();
      srcTri.delete();
      dstTri.delete();
    };

    const getMarkerCenter = (marker) => {
      const sum = marker.corners.reduce(
        (acc, corner) => ({ x: acc.x + corner.x, y: acc.y + corner.y }),
        { x: 0, y: 0 },
      );

      return {
        x: sum.x / marker.corners.length,
        y: sum.y / marker.corners.length,
      };
    };

    const orderMarkersForDocument = (markers) => {
      if (!markers || markers.length < 4) return null;

      const centers = markers.map((marker) => ({
        marker,
        center: getMarkerCenter(marker),
      }));

      centers.sort((a, b) => a.center.x - b.center.x);

      const leftMarkers = centers
        .slice(0, 2)
        .sort((a, b) => a.center.y - b.center.y);
      const rightMarkers = centers
        .slice(2)
        .sort((a, b) => a.center.y - b.center.y);

      return [
        leftMarkers[0].marker,
        rightMarkers[0].marker,
        rightMarkers[1].marker,
        leftMarkers[1].marker,
      ];
    };

    const getDocumentCorner = (marker, position) => {
      const cornerIndexMap = {
        topLeft: 3,
        topRight: 0,
        bottomRight: 2,
        bottomLeft: 1,
      };

      const corner = marker?.corners?.[cornerIndexMap[position]];
      return corner ? [corner.x, corner.y] : null;
    };

    let processed = false;
    let stableFrames = 0;

    const detectMarkersRobustly = () => {
      const scales = [1, 1.5, 2];
      const allDetectedMarkers = [];

      scales.forEach((scale) => {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = Math.round(canvas.width * scale);
        tempCanvas.height = Math.round(canvas.height * scale);

        const tempContext = tempCanvas.getContext("2d");
        tempContext.drawImage(
          canvas,
          0,
          0,
          tempCanvas.width,
          tempCanvas.height,
        );

        const imageData = tempContext.getImageData(
          0,
          0,
          tempCanvas.width,
          tempCanvas.height,
        );

        const detectedMarkers = detector.detect(imageData);

        detectedMarkers.forEach((marker) => {
          const normalizedMarker = {
            ...marker,
            corners: marker.corners.map((corner) => ({
              x: corner.x / scale,
              y: corner.y / scale,
            })),
          };

          allDetectedMarkers.push(normalizedMarker);
        });
      });

      const markerMap = new Map();
      allDetectedMarkers.forEach((marker) => {
        const existing = markerMap.get(marker.id);

        if (!existing) {
          markerMap.set(marker.id, marker);
          return;
        }

        existing.corners = existing.corners.map((corner, index) => ({
          x: (corner.x + marker.corners[index].x) / 2,
          y: (corner.y + marker.corners[index].y) / 2,
        }));
      });

      return Array.from(markerMap.values());
    };

    const process = () => {
      if (cancelled) return; // FIX: stop the loop for good once unmounted

      if (!video || video.readyState !== 4) {
        rafId = requestAnimationFrame(process);
        return;
      }

      // FIX: the entire body is now wrapped in try/catch. Previously, a
      // single thrown error anywhere in here (e.g. the `rderedCorners` typo
      // that used to be here) would silently kill the whole animation loop
      // forever, with no explanation in the console. Now it logs and keeps
      // scanning on the next frame instead of freezing.
      try {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        const markers = detectMarkersRobustly();

        markers.forEach((marker) => {
          context.strokeStyle = "red";
          context.lineWidth = 3;
          context.beginPath();
          marker.corners.forEach((corner, i) => {
            const next = marker.corners[(i + 1) % marker.corners.length];
            context.moveTo(corner.x, corner.y);
            context.lineTo(next.x, next.y);
          });
          context.stroke();
          context.fillStyle = "yellow";
          context.font = "20px sans-serif";
          context.fillText(
            `ID:${marker.id}`,
            marker.corners[0].x,
            marker.corners[0].y - 10,
          );
        });

        const selectedMarkers = markers.slice(0, 4);

        if (selectedMarkers.length >= 4) {
          stableFrames += 1;
        } else {
          stableFrames = 0;
        }

        if (stableFrames >= 6 && !processed) {
          processed = true;

          const orderedMarkers = orderMarkersForDocument(selectedMarkers);
          console.log("Ordered markers:", orderedMarkers);

          if (!orderedMarkers) {
            processed = false; // FIX: was left permanently stuck at `true`
            rafId = requestAnimationFrame(process);
            return;
          }

          const orderedCorners = [
            "topLeft",
            "topRight",
            "bottomRight",
            "bottomLeft",
          ]
            .map((position, index) =>
              getDocumentCorner(orderedMarkers[index], position),
            )
            .filter(Boolean);

          if (orderedCorners.length !== 4) {
            processed = false; // FIX: same reset — otherwise this path also
            // permanently locks `processed = true` with nothing ever run,
            // meaning the scanner silently stops trying forever.
            rafId = requestAnimationFrame(process);
            return;
          }

          // FIX: this was `console.log("order corner=", rderedCorners)` —
          // `rderedCorners` does not exist anywhere in the file (typo for
          // `orderedCorners`). That ReferenceError was thrown here on every
          // successful detection, which killed the animation loop right
          // before `getWarpedImage()` — the one function that actually uses
          // the successful detection — ever got called. This was the root
          // cause of "camera detects markers but nothing happens after."
          console.log("Ordered corners:", orderedCorners);

          context.strokeStyle = "lime";
          context.lineWidth = 3;
          context.beginPath();
          orderedCorners.forEach((pt, i) => {
            const next = orderedCorners[(i + 1) % 4];
            context.moveTo(pt[0], pt[1]);
            context.lineTo(next[0], next[1]);
          });
          context.stroke();

          console.log(
            "✅ Stable marker set detected:",
            orderedMarkers.map((marker) => marker.id).join(", "),
          );

          getWarpedImage(canvas, orderedCorners);
        }
      } catch (err) {
        // FIX: this catch is new — without it, any future bug in this block
        // (typo, null reference, OpenCV error, etc.) will again silently
        // stop the camera loop with zero explanation, and you'll be back to
        // "detection seems to work but nothing happens." Now it's always
        // visible in the console immediately.
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

      // FIX: previously nothing ever cancelled the requestAnimationFrame
      // loop on unmount — it kept calling itself forever in the background
      // (harmless once the stream is stopped, since readyState stops
      // advancing, but it's a real, avoidable leak, especially noticeable
      // under React StrictMode's mount→unmount→remount in dev).
      if (rafId) {
        cancelAnimationFrame(rafId);
      }

      const stream = video?.srcObject;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [onFourMarkersDetected]);
  // FIX: added onFourMarkersDetected to the dependency array. It's used
  // inside the effect, and omitting it (as before) is a stale-closure risk
  // if the parent ever passes a new callback — ESLint's exhaustive-deps rule
  // would flag this. If the parent doesn't memoize this prop, this may cause
  // the effect (and camera) to restart on every parent re-render — worth
  // wrapping the parent's callback in useCallback if that becomes an issue.

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
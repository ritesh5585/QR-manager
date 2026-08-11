let referenceMat = null;
let referenceKeypoints = null;
let referenceDescriptors = null;

export const loadReferenceCard = async (cv, imageUrl) => {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const src = cv.imread(img);
    if (src.empty()) {
      src.delete();
      return false;
    }

    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const orb = new cv.ORB();
    const keypoints = new cv.KeyPointVector();
    const descriptors = new cv.Mat();
    orb.detectAndCompute(gray, new cv.Mat(), keypoints, descriptors, false);

    referenceMat = gray.clone();
    referenceKeypoints = keypoints;
    referenceDescriptors = descriptors.clone();

    src.delete();
    gray.delete();
    orb.delete();
    descriptors.delete();

    console.log(`✅ Reference card loaded (${keypoints.size()} features)`);
    return true;
  } catch (error) {
    console.error("Failed to load reference card:", error);
    return false;
  }
};

function isConvexQuadrilateral(pts) {
  if (!pts || pts.length !== 4) return false;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % 4];
    const p3 = pts[(i + 2) % 4];
    const cross = (p2.x - p1.x) * (p3.y - p2.y) - (p2.y - p1.y) * (p3.x - p2.x);
    if (Math.abs(cross) < 1e-5) return false;
    const s = Math.sign(cross);
    if (sign === 0) sign = s;
    else if (sign !== s) return false;
  }
  return true;
}

/**
 * Find card in camera frame. Pass a DOWNSCALED frame (e.g. 400px wide) for
 * this — ORB cost scales with pixel count, and running it on full 640x480+
 * every ~100ms is the single biggest CPU cost in the scan loop.
 */
export const findCard = (cv, cameraMat) => {
  if (!referenceKeypoints || !referenceDescriptors) return null;

  const gray = new cv.Mat();
  const orb = new cv.ORB();
  const keypoints = new cv.KeyPointVector();
  const descriptors = new cv.Mat();
  const matcher = new cv.BFMatcher(cv.NORM_HAMMING, true);
  const matches = new cv.DMatchVector();
  const cleanupSet = [gray, orb, keypoints, descriptors, matcher, matches];
  const cleanup = (...extra) => [...cleanupSet, ...extra].forEach((m) => m?.delete?.());

  try {
    cv.cvtColor(cameraMat, gray, cv.COLOR_RGBA2GRAY);
    orb.detectAndCompute(gray, new cv.Mat(), keypoints, descriptors, false);

    if (keypoints.size() < 10) {
      cleanup();
      return null;
    }

    matcher.match(referenceDescriptors, descriptors, matches);

    const matchesArray = [];
    for (let i = 0; i < matches.size(); i++) matchesArray.push(matches.get(i));
    matchesArray.sort((a, b) => a.distance - b.distance);

    const numGood = Math.min(Math.floor(matchesArray.length * 0.5), 100);
    const goodMatches = matchesArray.slice(0, numGood);

    if (goodMatches.length < 15) {
      cleanup();
      return null;
    }

    const srcPoints = [];
    const dstPoints = [];
    for (const m of goodMatches) {
      const refPt = referenceKeypoints.get(m.queryIdx).pt;
      const camPt = keypoints.get(m.trainIdx).pt;
      srcPoints.push(refPt.x, refPt.y);
      dstPoints.push(camPt.x, camPt.y);
    }

    const srcMat = cv.matFromArray(goodMatches.length, 1, cv.CV_32FC2, srcPoints);
    const dstMat = cv.matFromArray(goodMatches.length, 1, cv.CV_32FC2, dstPoints);
    const inliers = new cv.Mat();
    const H = cv.findHomography(srcMat, dstMat, cv.RANSAC, 3.0, inliers, 2000, 0.995);

    if (H.empty()) {
      cleanup(srcMat, dstMat, inliers, H);
      return null;
    }

    const referenceCorners = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0, 0, referenceMat.cols, 0, referenceMat.cols, referenceMat.rows, 0, referenceMat.rows,
    ]);
    const cameraCorners = new cv.Mat();
    cv.perspectiveTransform(referenceCorners, cameraCorners, H);

    const corners = [];
    for (let i = 0; i < 4; i++) {
      corners.push({ x: cameraCorners.data32F[i * 2], y: cameraCorners.data32F[i * 2 + 1] });
    }

    const fail = () => cleanup(srcMat, dstMat, inliers, H, referenceCorners, cameraCorners);

    if (!isConvexQuadrilateral(corners)) {
      fail();
      return null;
    }

    const topW = Math.hypot(corners[1].x - corners[0].x, corners[1].y - corners[0].y);
    const botW = Math.hypot(corners[2].x - corners[3].x, corners[2].y - corners[3].y);
    const leftH = Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y);
    const rightH = Math.hypot(corners[2].x - corners[1].x, corners[2].y - corners[1].y);
    const avgWidth = (topW + botW) / 2;
    const avgHeight = (leftH + rightH) / 2;

    if (avgHeight === 0 || avgWidth === 0) {
      fail();
      return null;
    }

    const detectedAspectRatio = avgWidth / avgHeight;
    if (detectedAspectRatio < 0.35 || detectedAspectRatio > 1.1) {
      fail();
      return null;
    }

    const area = Math.abs(
      corners[0].x * corners[1].y - corners[1].x * corners[0].y +
      (corners[1].x * corners[2].y - corners[2].x * corners[1].y) +
      (corners[2].x * corners[3].y - corners[3].x * corners[2].y) +
      (corners[3].x * corners[0].y - corners[0].x * corners[3].y)
    ) / 2;
    const frameArea = cameraMat.rows * cameraMat.cols;

    if (area < frameArea * 0.05) {
      fail();
      return null;
    }

    // H, srcMat, dstMat, inliers, referenceCorners, cameraCorners are all
    // temporaries we're done with. Only `corners` (plain JS objects) survive.
    cleanup(srcMat, dstMat, inliers, H, referenceCorners, cameraCorners);

    return { found: true, corners, matches: goodMatches.length, area, aspectRatio: detectedAspectRatio };
  } catch (error) {
    console.error("Card matching error:", error);
    cleanup();
    return null;
  }
};

export const cleanupReference = () => {
  referenceMat?.delete();
  referenceKeypoints?.delete();
  referenceDescriptors?.delete();
  referenceMat = null;
  referenceKeypoints = null;
  referenceDescriptors = null;
};
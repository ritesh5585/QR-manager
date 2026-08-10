
let referenceMat = null;
let referenceKeypoints = null;
let referenceDescriptors = null;

/**
 * Load reference image
 */
export const loadReferenceCard = async (cv, imageUrl) => {
  try {
    console.log("📸 Loading reference card:", imageUrl);

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;

    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const src = cv.imread(img);

    if (src.empty()) {
      console.error("Failed to load reference image");
      return false;
    }

    // Convert to grayscale
    const gray = new cv.Mat();
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Detect ORB features
    const orb = new cv.ORB();
    const keypoints = new cv.KeyPointVector();
    const descriptors = new cv.Mat();

    orb.detectAndCompute(gray, new cv.Mat(), keypoints, descriptors, false);

    // Store reference data
    referenceMat = gray.clone();
    referenceKeypoints = keypoints;
    referenceDescriptors = descriptors.clone();

    // Cleanup
    src.delete();
    gray.delete();
    orb.delete();

    console.log(`✅ Loaded reference card with ${keypoints.size()} features`);

    return true;
  } catch (error) {
    console.error(" Failed to load reference card:", error);
    return false;
  }
};

/**
 * Find card in camera frame
 */
export const findCard = (cv, cameraMat) => {
  if (!referenceKeypoints || !referenceDescriptors) {
    console.error(" Reference card not loaded");
    return null;
  }

  try {
    // Convert camera frame to grayscale
    const gray = new cv.Mat();
    cv.cvtColor(cameraMat, gray, cv.COLOR_RGBA2GRAY);

    // Detect ORB features in camera frame
    const orb = new cv.ORB();
    const keypoints = new cv.KeyPointVector();
    const descriptors = new cv.Mat();

    orb.detectAndCompute(gray, new cv.Mat(), keypoints, descriptors, false);

    if (keypoints.size() < 10) {
      gray.delete();
      orb.delete();
      keypoints.delete();
      descriptors.delete();
      return null;
    }

    // Match features
    const matcher = new cv.BFMatcher(cv.NORM_HAMMING, true);
    const matches = new cv.DMatchVector();
    matcher.match(referenceDescriptors, descriptors, matches);

    // Filter good matches
    const matchesArray = [];
    for (let i = 0; i < matches.size(); i++) {
      matchesArray.push(matches.get(i));
    }

    matchesArray.sort((a, b) => a.distance - b.distance);

    const numGoodMatches = Math.min(Math.floor(matchesArray.length * 0.5), 100);
    const goodMatches = matchesArray.slice(0, numGoodMatches);

    // Need at least 15 good matches
    if (goodMatches.length < 15) {
      gray.delete();
      orb.delete();
      keypoints.delete();
      descriptors.delete();
      matcher.delete();
      matches.delete();
      return null;
    }

    // Extract points for homography
    const srcPoints = [];
    const dstPoints = [];

    for (const match of goodMatches) {
      const refPt = referenceKeypoints.get(match.queryIdx).pt;
      const camPt = keypoints.get(match.trainIdx).pt;
      srcPoints.push(refPt.x, refPt.y);
      dstPoints.push(camPt.x, camPt.y);
    }

    const srcMat = cv.matFromArray(
      goodMatches.length,
      1,
      cv.CV_32FC2,
      srcPoints,
    );
    const dstMat = cv.matFromArray(
      goodMatches.length,
      1,
      cv.CV_32FC2,
      dstPoints,
    );

    // Find homography
    const inliers = new cv.Mat();
    const H = cv.findHomography(
      srcMat,
      dstMat,
      cv.RANSAC,
      3.0,
      inliers,
      2000,
      0.995,
    );

    if (H.empty()) {
      gray.delete();
      orb.delete();
      keypoints.delete();
      descriptors.delete();
      matcher.delete();
      matches.delete();
      srcMat.delete();
      dstMat.delete();
      inliers.delete();
      return null;
    }

    // Get card corners
    const referenceCorners = cv.matFromArray(4, 1, cv.CV_32FC2, [
      0,
      0,
      referenceMat.cols,
      0,
      referenceMat.cols,
      referenceMat.rows,
      0,
      referenceMat.rows,
    ]);

    const cameraCorners = new cv.Mat();
    cv.perspectiveTransform(referenceCorners, cameraCorners, H);

    // Extract corner points
    const corners = [];
    for (let i = 0; i < 4; i++) {
      const data = cameraCorners.data32F;
      corners.push({
        x: data[i * 2],
        y: data[i * 2 + 1],
      });
    }

    // Calculate area
    const area =
      Math.abs(
        corners[0].x * corners[1].y -
          corners[1].x * corners[0].y +
          (corners[1].x * corners[2].y - corners[2].x * corners[1].y) +
          (corners[2].x * corners[3].y - corners[3].x * corners[2].y) +
          (corners[3].x * corners[0].y - corners[0].x * corners[3].y),
      ) / 2;

    const frameArea = cameraMat.rows * cameraMat.cols;

    // Card should be at least 5% of frame
    if (area < frameArea * 0.05) {
      H.delete();
      gray.delete();
      orb.delete();
      keypoints.delete();
      descriptors.delete();
      matcher.delete();
      matches.delete();
      srcMat.delete();
      dstMat.delete();
      inliers.delete();
      referenceCorners.delete();
      cameraCorners.delete();
      return null;
    }

    // Cleanup
    gray.delete();
    orb.delete();
    keypoints.delete();
    descriptors.delete();
    matcher.delete();
    matches.delete();
    srcMat.delete();
    dstMat.delete();
    inliers.delete();
    referenceCorners.delete();
    cameraCorners.delete();

    return {
      found: true,
      corners: corners,
      homography: H,
      matches: goodMatches.length,
      area: area,
    };
  } catch (error) {
    console.error("❌ Card matching error:", error);
    return null;
  }
};

/**
 * Cleanup reference data
 */
export const cleanupReference = () => {
  if (referenceMat) {
    referenceMat.delete();
    referenceMat = null;
  }
  if (referenceKeypoints) {
    referenceKeypoints.delete();
    referenceKeypoints = null;
  }
  if (referenceDescriptors) {
    referenceDescriptors.delete();
    referenceDescriptors = null;
  }
};

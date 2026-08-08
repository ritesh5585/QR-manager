// cardMatcher.js
//
// This file does one job:
//
// 1. Load our reference card.
// 2. Remember the important features of that card.
// 3. Compare camera frames with the reference card.
// 4. If the card is found, return its 4 corners.
//
// ORB = finds interesting points in the image.
// Homography = tells us where the reference card is
// inside the camera image.

let referenceKeypoints = null;
let referenceDescriptors = null;
let referenceWidth = 0;
let referenceHeight = 0;

// --------------------------------------------------
// 1. LOAD THE REFERENCE CARD
// --------------------------------------------------

export async function loadReferenceCard(cv, imageUrl) {
  try {
    console.log("Loading reference card:", imageUrl);

    // Create a normal browser image.
    const image = new Image();

    // Needed when image is coming from another domain.
    image.crossOrigin = "anonymous";

    // Tell browser which image to load.
    image.src = imageUrl;

    // Wait until image is actually loaded.
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
    });

    console.log("Reference image loaded.");

    // Convert browser image into OpenCV Mat.
    const imageMat = cv.imread(image);

    // Remember original card size.
    referenceWidth = imageMat.cols;
    referenceHeight = imageMat.rows;

    // ORB works better with grayscale images.
    const gray = new cv.Mat();

    cv.cvtColor(imageMat, gray, cv.COLOR_RGBA2GRAY);

    // Create ORB detector.
    const orb = new cv.ORB();

    // These will contain the important points
    // and their descriptions.
    const keypoints = new cv.KeyPointVector();
    const descriptors = new cv.Mat();

    // Find features in our reference card.
    orb.detectAndCompute(gray, new cv.Mat(), keypoints, descriptors, false);

    // Save them.
    referenceKeypoints = keypoints;
    referenceDescriptors = descriptors;

    console.log(`Reference card ready. Found ${keypoints.size()} features.`);

    // We don't need these anymore.
    gray.delete();
    imageMat.delete();
    orb.delete();

    return true;
  } catch (error) {
    console.error("Could not load reference card:", error);

    return false;
  }
}

// --------------------------------------------------
// 2. FIND CARD INSIDE CAMERA IMAGE
// --------------------------------------------------

export function findCard(cv, cameraMat) {
  // We cannot search if reference card
  // hasn't been loaded yet.
  if (!referenceKeypoints || !referenceDescriptors) {
    console.log("Reference card is not loaded.");

    return null;
  }

  // Convert camera image to grayscale.
  const gray = new cv.Mat();

  cv.cvtColor(cameraMat, gray, cv.COLOR_RGBA2GRAY);

  // Create ORB.
  const orb = new cv.ORB();

  // These will contain features from
  // the current camera frame.
  const cameraKeypoints = new cv.KeyPointVector();

  const cameraDescriptors = new cv.Mat();

  // Find features in camera frame.
  orb.detectAndCompute(
    gray,
    new cv.Mat(),
    cameraKeypoints,
    cameraDescriptors,
    false,
  );

  // If camera image doesn't contain
  // enough useful details, stop here.
  if (cameraKeypoints.size() < 10) {
    console.log("Not enough features in camera frame.");

    gray.delete();
    orb.delete();
    cameraKeypoints.delete();
    cameraDescriptors.delete();

    return null;
  }

  // ------------------------------------------------
  // MATCH REFERENCE CARD WITH CAMERA FRAME
  // ------------------------------------------------

  const matcher = new cv.BFMatcher(cv.NORM_HAMMING, true);

  const matches = new cv.DMatchVector();

  matcher.match(referenceDescriptors, cameraDescriptors, matches);

  // Convert matches into normal JavaScript array.
  const matchList = [];

  for (let i = 0; i < matches.size(); i++) {
    matchList.push(matches.get(i));
  }

  // Smaller distance = better match.
  matchList.sort((a, b) => a.distance - b.distance);

  // Take the best matches.
  const numberOfGoodMatches = Math.min(Math.floor(matchList.length * 0.5), 100);

  const goodMatches = matchList.slice(0, numberOfGoodMatches);

  console.log(`Good matches: ${goodMatches.length}`);

  // We need enough matches before
  // calculating the card position.
  if (goodMatches.length < 15) {
    console.log("Card not recognized.");

    gray.delete();
    orb.delete();
    cameraKeypoints.delete();
    cameraDescriptors.delete();
    matcher.delete();
    matches.delete();

    return null;
  }

  // ------------------------------------------------
  // GET MATCHING POINTS
  // ------------------------------------------------

  const referencePoints = [];
  const cameraPoints = [];

  for (const match of goodMatches) {
    // Point from reference card.
    const referencePoint = referenceKeypoints.get(match.queryIdx).pt;

    // Corresponding point from camera.
    const cameraPoint = cameraKeypoints.get(match.trainIdx).pt;

    referencePoints.push(referencePoint.x, referencePoint.y);

    cameraPoints.push(cameraPoint.x, cameraPoint.y);
  }

  // Convert JavaScript arrays
  // into OpenCV matrices.
  const referenceMat = cv.matFromArray(
    goodMatches.length,
    1,
    cv.CV_32FC2,
    referencePoints,
  );

  const cameraMatPoints = cv.matFromArray(
    goodMatches.length,
    1,
    cv.CV_32FC2,
    cameraPoints,
  );

  // ------------------------------------------------
  // FIND HOMOGRAPHY
  // ------------------------------------------------

  const inliers = new cv.Mat();

  const homography = cv.findHomography(
    referenceMat,
    cameraMatPoints,
    cv.RANSAC,
    3.0,
    inliers,
    2000,
    0.995,
  );

  if (homography.empty()) {
    console.log("Could not calculate card position.");

    gray.delete();
    orb.delete();
    cameraKeypoints.delete();
    cameraDescriptors.delete();
    matcher.delete();
    matches.delete();
    referenceMat.delete();
    cameraMatPoints.delete();
    inliers.delete();
    homography.delete();

    return null;
  }

  // ------------------------------------------------
  // FIND FOUR CORNERS OF THE CARD
  // ------------------------------------------------

  const referenceCorners = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0,
    0,

    referenceWidth,
    0,

    referenceWidth,
    referenceHeight,

    0,
    referenceHeight,
  ]);

  const cameraCorners = new cv.Mat();

  // Move reference card corners
  // into their positions in camera image.
  cv.perspectiveTransform(referenceCorners, cameraCorners, homography);

  const data = cameraCorners.data32F;

  const corners = [
    {
      x: data[0],
      y: data[1],
    },

    {
      x: data[2],
      y: data[3],
    },

    {
      x: data[4],
      y: data[5],
    },

    {
      x: data[6],
      y: data[7],
    },
  ];

  console.log("Card found!", corners);

  // ------------------------------------------------
  // CLEAN TEMPORARY OPENCV OBJECTS
  // ------------------------------------------------

  gray.delete();
  orb.delete();
  cameraKeypoints.delete();
  cameraDescriptors.delete();
  matcher.delete();
  matches.delete();
  referenceMat.delete();
  cameraMatPoints.delete();
  inliers.delete();
  referenceCorners.delete();
  cameraCorners.delete();

  // IMPORTANT:
  // We do NOT delete homography here.
  //
  // We are returning it to the caller.
  // The caller must delete it when finished.
  return {
    found: true,

    corners,

    homography,

    matches: goodMatches.length,
  };
}

// --------------------------------------------------
// 3. CLEAN UP REFERENCE CARD
// --------------------------------------------------

export function cleanupReferenceCard() {
  if (referenceKeypoints) {
    referenceKeypoints.delete();
    referenceKeypoints = null;
  }

  if (referenceDescriptors) {
    referenceDescriptors.delete();
    referenceDescriptors = null;
  }

  referenceWidth = 0;
  referenceHeight = 0;

  console.log("Reference card cleaned up.");
}

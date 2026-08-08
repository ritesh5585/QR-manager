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
export async function loadReferenceCard(cv, cardConfig) {}
// --------------------------------------------------
// 2. FIND CARD INSIDE CAMERA IMAGE
// --------------------------------------------------
export function findCard(cv, frameMat, cardConfig) {}
// ------------------------------------------------
// MATCH REFERENCE CARD WITH CAMERA FRAME
// ------------------------------------------------
// ------------------------------------------------
// GET MATCHING POINTS
// ------------------------------------------------
// ------------------------------------------------
// FIND HOMOGRAPHY
// ------------------------------------------------
// ------------------------------------------------
// FIND FOUR CORNERS OF THE CARD
// ------------------------------------------------
// ------------------------------------------------
// CLEAN TEMPORARY OPENCV OBJECTS
// ------------------------------------------------
// --------------------------------------------------
// 3. CLEAN UP REFERENCE CARD
// --------------------------------------------------
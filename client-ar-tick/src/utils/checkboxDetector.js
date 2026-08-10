// This file has ONE job:
//
// Look at the known checkbox areas on the straightened card
// and decide which checkbox has a tick.
//
// The flow is:
//
// camera
//   ↓
// cardMatcher
//   ↓
// cardWarp
//   ↓
// checkboxDetector   ← THIS FILE
//   ↓
// results
//
// ============================================================
// 1. DETECT ONE CHECKBOX
// ============================================================
//
// Input:
//   checkboxMat = image of ONE checkbox
//
// Output:
//   percentage of dark/ink pixels inside the checkbox.
//
// Example:
//
// Empty:
//
// ┌───────┐
// │       │
// │       │
// │       │
// └───────┘
//
// Tick:
//
// ┌───────┐
// │   ✓   │
// │  /    │
// │       │
// └───────┘
//
// The tick creates more dark pixels.
// ============================================================

export function detectCheckbox(cv, checkboxMat, threshold = 120) {
  try {
    // --------------------------------------------------------
    // Convert checkbox image to grayscale.
    // --------------------------------------------------------
    const gray = new cv.Mat();

    if (checkboxMat.channels() > 1) {
      cv.cvtColor(checkboxMat, gray, cv.COLOR_RGBA2GRAY);
    } else {
      checkboxMat.copyTo(gray);
    }

    // --------------------------------------------------------
    // Convert image into black and white.
    //
    // THRESH_BINARY_INV means:
    //
    // dark pixels → white
    // light pixels → black
    //
    // This makes it easy to count the dark/ink area.
    // --------------------------------------------------------

    const binary = new cv.Mat();

    cv.threshold(gray, binary, threshold, 255, cv.THRESH_BINARY_INV);

    // --------------------------------------------------------
    // Ignore the outside border of the checkbox.
    //
    // Why?
    //
    // The checkbox outline itself is dark.
    // We don't want the outline to make an empty box
    // look like a checked box.
    //
    // We only look at the middle 60%.
    // --------------------------------------------------------

    const marginX = Math.round(gray.cols * 0.2);
    const marginY = Math.round(gray.rows * 0.2);
    const innerWidth = Math.max(1, gray.cols - marginX * 2);
    const innerHeight = Math.max(1, gray.rows - marginY * 2);
    const innerRectangle = new cv.Rect(
      marginX,
      marginY,
      innerWidth,
      innerHeight,
    );

    const innerArea = binary.roi(innerRectangle);

    // --------------------------------------------------------
    // Count white pixels.
    //
    // Remember:
    //
    // We inverted the image.
    //
    // So white pixels represent dark/ink pixels
    // from the original image.
    // --------------------------------------------------------

    const totalPixels = innerArea.rows * innerArea.cols;

    const inkPixels = cv.countNonZero(innerArea);

    // Convert to percentage.
    const inkPercentage = (inkPixels / totalPixels) * 100;

    // --------------------------------------------------------
    // Cleanup OpenCV memory.
    // --------------------------------------------------------

    gray.delete();
    binary.delete();
    innerArea.delete();

    return inkPercentage;
  } catch (error) {
    console.error("Checkbox detection failed:", error);

    return 0;
  }
}
// ============================================================
// 2. ANALYZE ALL CHECKBOXES
// ============================================================
//
// The card has already been warped.
//
// Therefore every checkbox has a known position.
//
// Example:
//
// checkbox 1 → x/y/width/height
// checkbox 2 → x/y/width/height
// checkbox 3 → x/y/width/height
//
// We simply visit each one.

export function analyzeCheckboxes(cv, warpedCard, config, options = {}) {
  const results = [];

  // ----------------------------------------------------------
  // Detection settings
  // ----------------------------------------------------------

  const threshold = options.threshold ?? 120;
  const checkedDifference = options.checkedDifference ?? 10;
  const minimumInk = options.minimumInk ?? 5;

  // ----------------------------------------------------------
  // Look at every checkbox.
  // ----------------------------------------------------------

  for (const checkbox of config.checkboxes) {
    const { x, y, width, height } = checkbox.roi;

    // --------------------------------------------------------
    // Convert percentage coordinates into pixels.
    // --------------------------------------------------------

    const roiX = Math.round(x * warpedCard.cols);
    const roiY = Math.round(y * warpedCard.rows);
    const roiWidth = Math.round(width * warpedCard.cols);
    const roiHeight = Math.round(height * warpedCard.rows);

    // --------------------------------------------------------
    // Create rectangle around checkbox.
    // --------------------------------------------------------

    const rectangle = new cv.Rect(roiX, roiY, roiWidth, roiHeight);

    // Get checkbox image.
    const checkboxImage = warpedCard.roi(rectangle);

    // --------------------------------------------------------
    // Measure how much ink is inside.
    // --------------------------------------------------------

    const inkPercentage = detectCheckbox(cv, checkboxImage, threshold);

    // --------------------------------------------------------
    // Save result.
    // --------------------------------------------------------

    results.push({
      number: checkbox.number,
      title: checkbox.title,
      fileType: checkbox.fileType,
      displayName: checkbox.displayName,
      inkPercentage: Math.round(inkPercentage),
      isChecked: false,
    });

    checkboxImage.delete();
  }

  // ----------------------------------------------------------
  // FIND THE EMPTY-BOX BASELINE
  // ----------------------------------------------------------
  //
  // Usually an empty checkbox contains very little ink.
  //
  // Example:
  //
  // Box 1 → 4%
  // Box 2 → 5%
  // Box 3 → 18%
  //
  // Baseline = 4%
  //
  // Therefore box 3 is probably checked.
  //
  // ----------------------------------------------------------
  const baseline = Math.min(...results.map((result) => result.inkPercentage));
  // ----------------------------------------------------------
  // Decide which boxes are checked.
  // ----------------------------------------------------------

  for (const result of results) {
    const difference = result.inkPercentage - baseline;
    result.differenceFromBaseline = Math.round(difference);
    result.isChecked =
      difference >= checkedDifference && result.inkPercentage >= minimumInk;
  }

  // ----------------------------------------------------------
  // Return useful information to the caller.
  // ----------------------------------------------------------

  const checkedBoxes = results.filter((result) => result.isChecked);

  return {
    results,
    baseline,
    checkedCount: checkedBoxes.length,
    checkedBoxes,
  };
}
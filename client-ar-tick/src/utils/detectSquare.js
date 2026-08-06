// ============================================
// FILE: src/utils/detectSquare.js
// (FIXED VERSION - ONLY RETURNS CHECKED BOXES)
// ============================================

import { toast } from "react-hot-toast";

// FIXED MAPPING - Each checkbox has a fixed position and name
const CHECKBOX_MAPPING = {
  1: {
    id: 1,
    title: "i_eat_while_distracted",
    fileType: "mp4",
    position: { x: 26, y: 455, size: 38 }
  },
  2: {
    id: 2,
    title: "i_eat_in_a_hurry",
    fileType: "mp4",
    position: { x: 26, y: 595, size: 38 }
  },
  3: {
    id: 3,
    title: "i_eat_mindfully",
    fileType: "jpg",
    position: { x: 26, y: 735, size: 38 }
  }
};

const CONFIG = {
  cardWidth: 600,
  cardHeight: 1000,
  minFillPercentage: 15,
  maxFillPercentage: 85,
  confidenceThreshold: 40,
};

const analyzeCheckbox = (cv, checkboxMat) => {
  let gray = checkboxMat;
  let needsCleanup = false;
  
  if (checkboxMat.channels() > 1) {
    gray = new cv.Mat();
    cv.cvtColor(checkboxMat, gray, cv.COLOR_RGBA2GRAY);
    needsCleanup = true;
  }
  
  const insetX = Math.round(gray.cols * 0.2);
  const insetY = Math.round(gray.rows * 0.2);
  const insetW = Math.max(1, gray.cols - insetX * 2);
  const insetH = Math.max(1, gray.rows - insetY * 2);
  
  const innerRoi = new cv.Rect(insetX, insetY, insetW, insetH);
  const innerMat = gray.roi(innerRoi);
  
  const thresh = new cv.Mat();
  cv.threshold(innerMat, thresh, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
  
  const totalPixels = thresh.rows * thresh.cols;
  const blackPixels = cv.countNonZero(thresh);
  const fillPercentage = (blackPixels / totalPixels) * 100;
  
  const isChecked = fillPercentage >= CONFIG.minFillPercentage && 
                    fillPercentage <= CONFIG.maxFillPercentage;
  
  let confidence = 0;
  if (isChecked) {
    confidence = Math.min(100, (fillPercentage / 50) * 100);
  } else {
    confidence = Math.max(0, 100 - (fillPercentage / 20) * 100);
  }
  
  innerMat.delete();
  thresh.delete();
  if (needsCleanup) gray.delete();
  
  return {
    isChecked,
    confidence: Math.round(Math.min(Math.max(confidence, 0), 100)),
    fillPercentage: Math.round(fillPercentage),
    blackPixels,
    totalPixels,
  };
};

export const detectSquares = async ({
  cv,
  imgRef,
  qrId,
  squareContent,
  navigate,
  setIsModalOpen,
  onDebug,
}) => {
  if (!cv || !imgRef?.current) {
    console.error("❌ Invalid: cv or imgRef missing");
    return;
  }

  const img = imgRef.current;
  const src = cv.imread(img);
  
  if (src.empty()) {
    console.error("❌ Failed to read image");
    if (setIsModalOpen) setIsModalOpen(true);
    return;
  }

  let warped = null;
  let debugMat = null;

  try {
    console.log("📐 Processing image:", src.cols, "x", src.rows);
    
    warped = new cv.Mat();
    cv.resize(src, warped, new cv.Size(CONFIG.cardWidth, CONFIG.cardHeight), 0, 0, cv.INTER_LINEAR);
    
    console.log("📐 Warped:", warped.cols, "x", warped.rows);
    
    const results = [];
    const checkedBoxes = [];
    
    // Loop through FIXED checkbox positions
    Object.keys(CHECKBOX_MAPPING).forEach((key) => {
      const checkbox = CHECKBOX_MAPPING[key];
      const { x, y, size } = checkbox.position;
      
      const cropX = Math.max(0, Math.min(x, warped.cols - 1));
      const cropY = Math.max(0, Math.min(y, warped.rows - 1));
      const cropSize = Math.min(size, Math.min(warped.cols - cropX, warped.rows - cropY));
      
      if (cropSize > 10) {
        const roi = new cv.Rect(cropX, cropY, cropSize, cropSize);
        const checkboxMat = warped.roi(roi);
        const analysis = analyzeCheckbox(cv, checkboxMat);
        
        const result = {
          number: checkbox.id,
          title: checkbox.title,
          fileType: checkbox.fileType,
          isChecked: analysis.isChecked,
          confidence: analysis.confidence,
          fillPercentage: analysis.fillPercentage,
        };
        
        results.push(result);
        
        if (analysis.isChecked && analysis.confidence >= CONFIG.confidenceThreshold) {
          checkedBoxes.push(result);
        }
        
        checkboxMat.delete();
      }
    });
    
    console.log("📊 Results:", results);
    console.log(`✅ Found ${checkedBoxes.length} checked boxes:`, 
      checkedBoxes.map(r => `#${r.number}: ${r.title}`).join(', '));
    
    // Debug visualization
    if (onDebug) {
      try {
        debugMat = warped.clone();
        results.forEach((result) => {
          const checkbox = CHECKBOX_MAPPING[result.number];
          const color = result.isChecked ? [0, 255, 0] : [255, 0, 0];
          cv.rectangle(
            debugMat,
            new cv.Point(checkbox.position.x, checkbox.position.y),
            new cv.Point(checkbox.position.x + checkbox.position.size, 
                        checkbox.position.y + checkbox.position.size),
            new cv.Scalar(color[0], color[1], color[2]),
            3
          );
        });
        
        const debugCanvas = document.createElement("canvas");
        cv.imshow(debugCanvas, debugMat);
        
        onDebug({
          imageSize: { width: src.cols, height: src.rows },
          warpedSize: { width: CONFIG.cardWidth, height: CONFIG.cardHeight },
          checkboxes: results,
          checkedCount: checkedBoxes.length,
          fullImageUrl: debugCanvas.toDataURL(),
          error: null,
        });
        
        debugCanvas.remove();
      } catch (debugError) {
        console.error("Debug error:", debugError);
      }
    }
    
    // ONLY SEND CHECKED BOXES
    if (checkedBoxes.length > 0 && qrId) {
      try {
        const payload = checkedBoxes.map(r => ({
          number: r.number,
          title: r.title,
          fileType: r.fileType,
          confidence: r.confidence,
          fillPercentage: r.fillPercentage,
        }));
        
        console.log("📤 Sending checked boxes:", payload);
        
        const response = await fetch(
          `${import.meta.env.VITE_API_URL}/qr/assign/${qrId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        );
        
        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }
        
        toast.success(`✅ Found ${checkedBoxes.length} option(s)`);
        
        if (navigate) {
          navigate(`/result/${qrId}`);
        }
        
        return { success: true, checked: checkedBoxes };
      } catch (error) {
        console.error("❌ API error:", error);
        toast.error("Failed to save results");
        throw error;
      }
    } else {
      console.warn("⚠️ No checkboxes detected");
      if (setIsModalOpen) setIsModalOpen(true);
      return { success: false, reason: "No checkboxes detected" };
    }
    
  } catch (error) {
    console.error("❌ Detection error:", error);
    toast.error("Detection failed: " + error.message);
    if (setIsModalOpen) setIsModalOpen(true);
    throw error;
  } finally {
    src.delete();
    if (warped) warped.delete();
    if (debugMat) debugMat.delete();
  }
};
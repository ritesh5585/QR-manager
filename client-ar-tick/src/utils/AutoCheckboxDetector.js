// utils/AutoCheckboxDetector.js
// Updated to work with dynamic detection system

import { ConfigHelpers } from '../cards/config.js';

/**
 * AutoCheckboxDetector - Automatically detects and aligns checkboxes on cards
 * Uses computer vision to find checkbox patterns and dynamically adjust ROIs
 */
export class AutoCheckboxDetector {
  constructor(cv, options = {}) {
    this.cv = cv;
    this.debugMode = options.debugMode || true;
    this.checkboxPattern = null;
    this.detectedBoxes = [];
    this.detectionHistory = [];
    this.confidenceThreshold = options.confidenceThreshold || 0.6;
    this.maxHistorySize = options.maxHistorySize || 10;
  }

  /**
   * Main method to detect and align checkboxes
   */
  detectCheckboxes(warpedCard, config, isDynamicMode = true) {
    try {
      const cv = this.cv;

      // Step 1: Find all potential checkbox regions
      const candidates = this.findCheckboxCandidates(warpedCard);

      if (candidates.length === 0) {
        console.warn("⚠️ No checkbox candidates found");
        return this.fallbackToConfig(warpedCard, config);
      }

      // Step 2: Cluster candidates by vertical position
      const clusters = this.clusterByVerticalPosition(candidates);

      if (clusters.length === 0) {
        return this.fallbackToConfig(warpedCard, config);
      }

      // Step 3: If in dynamic mode, use auto-detected positions
      if (isDynamicMode) {
        const dynamicROIs = this.createDynamicROIs(clusters, warpedCard, config);
        
        // Step 4: Validate and refine dynamic ROIs
        const refinedROIs = this.refineDynamicROIs(dynamicROIs, warpedCard, config);
        
        console.log(`✅ Auto-detected ${refinedROIs.length} checkboxes (dynamic mode)`);
        
        // Update detection history
        this.updateHistory(refinedROIs);
        
        return refinedROIs;
      } else {
        // Static mode: use config but verify positions
        return this.verifyStaticROIs(config, warpedCard);
      }
    } catch (error) {
      console.error("❌ Auto-detection failed:", error);
      return this.fallbackToConfig(warpedCard, config);
    }
  }

  /**
   * Find all checkbox candidates using morphological operations
   */
  findCheckboxCandidates(image) {
    const cv = this.cv;
    const candidates = [];

    try {
      // Convert to grayscale
      const gray = new cv.Mat();
      if (image.channels() > 1) {
        cv.cvtColor(image, gray, cv.COLOR_RGBA2GRAY);
      } else {
        image.copyTo(gray);
      }

      // Enhance contrast
      const enhanced = new cv.Mat();
      const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
      clahe.apply(gray, enhanced);
      clahe.delete();

      // Binary threshold
      const binary = new cv.Mat();
      cv.threshold(
        enhanced,
        binary,
        0,
        255,
        cv.THRESH_BINARY_INV + cv.THRESH_OTSU,
      );

      // Find contours to detect square shapes
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      cv.findContours(
        binary,
        contours,
        hierarchy,
        cv.RETR_EXTERNAL,
        cv.CHAIN_APPROX_SIMPLE,
      );

      const imgHeight = image.rows;
      const imgWidth = image.cols;

      // Analyze each contour
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const area = cv.contourArea(contour);

        // Skip too small or too large areas
        const minArea = imgWidth * imgHeight * 0.0005; // 0.05% of image
        const maxArea = imgWidth * imgHeight * 0.015; // 1.5% of image

        if (area < minArea || area > maxArea) {
          contour.delete();
          continue;
        }

        // Check if shape is square-like
        const rect = cv.boundingRect(contour);
        const aspectRatio = rect.width / rect.height;

        // Checkbox should be roughly square (aspect ratio 0.7 - 1.3)
        if (aspectRatio < 0.6 || aspectRatio > 1.4) {
          contour.delete();
          continue;
        }

        // Check if it's a checkbox (has hole/empty center)
        const isCheckbox = this.isCheckboxShape(binary, rect);

        if (isCheckbox) {
          // Calculate confidence based on shape characteristics
          const confidence = this.calculateConfidence(contour, rect, area, imgWidth, imgHeight);
          
          candidates.push({
            x: rect.x / imgWidth,
            y: rect.y / imgHeight,
            width: rect.width / imgWidth,
            height: rect.height / imgHeight,
            area: area,
            centerX: (rect.x + rect.width / 2) / imgWidth,
            centerY: (rect.y + rect.height / 2) / imgHeight,
            confidence: confidence,
            rect: rect,
          });
        }

        contour.delete();
      }

      // Cleanup
      gray.delete();
      enhanced.delete();
      binary.delete();
      contours.delete();
      hierarchy.delete();

      if (this.debugMode) {
        console.log(`🔍 Found ${candidates.length} checkbox candidates`);
      }

      // Filter by confidence
      const filtered = candidates.filter(c => c.confidence > this.confidenceThreshold);
      
      if (this.debugMode && filtered.length < candidates.length) {
        console.log(`📊 Filtered to ${filtered.length} candidates (confidence > ${this.confidenceThreshold})`);
      }

      return filtered;
    } catch (error) {
      console.error("❌ Candidate detection error:", error);
      return [];
    }
  }

  /**
   * Calculate confidence score for a candidate
   */
  calculateConfidence(contour, rect, area, imgWidth, imgHeight) {
    const cv = this.cv;
    let confidence = 0.5;
    
    try {
      // 1. Area ratio confidence
      const expectedArea = (imgWidth * imgHeight * 0.003); // 0.3% of image
      const areaRatio = Math.min(area / expectedArea, expectedArea / area);
      confidence += areaRatio * 0.3;

      // 2. Aspect ratio confidence
      const aspectRatio = rect.width / rect.height;
      const aspectScore = 1 - Math.abs(aspectRatio - 1) * 0.5;
      confidence += aspectScore * 0.2;

      // 3. Contour shape confidence (how square-like)
      const peri = cv.arcLength(contour, true);
      const approx = new cv.Mat();
      cv.approxPolyDP(contour, approx, 0.02 * peri, true);
      const vertices = approx.rows;
      approx.delete();
      
      // A checkbox should have 4-8 vertices
      const vertexScore = vertices >= 4 && vertices <= 8 ? 1 : 0.5;
      confidence += vertexScore * 0.3;

      // Clamp confidence
      confidence = Math.min(1, Math.max(0, confidence));
      
      return confidence;
    } catch (error) {
      return 0.5;
    }
  }

  /**
   * Check if a contour is actually a checkbox (has hollow center)
   */
  isCheckboxShape(binary, rect) {
    const cv = this.cv;
    try {
      // Extract the region
      const roi = binary.roi(rect);

      // Check if center is empty (typical checkbox pattern)
      const centerX = Math.floor(roi.cols / 2);
      const centerY = Math.floor(roi.rows / 2);
      const centerSize = Math.min(roi.cols, roi.rows) * 0.35;

      let emptyCount = 0;
      let totalCount = 0;

      // Sample pixels in center region
      for (
        let y = Math.floor(centerY - centerSize / 2);
        y < Math.floor(centerY + centerSize / 2);
        y++
      ) {
        for (
          let x = Math.floor(centerX - centerSize / 2);
          x < Math.floor(centerX + centerSize / 2);
          x++
        ) {
          if (x >= 0 && x < roi.cols && y >= 0 && y < roi.rows) {
            const pixel = roi.ucharPtr(y, x)[0];
            if (pixel === 0) emptyCount++; // Empty (black in inverted binary)
            totalCount++;
          }
        }
      }

      const emptyRatio = totalCount > 0 ? emptyCount / totalCount : 0;
      roi.delete();

      // Checkbox should have empty center (ratio > 0.35)
      return emptyRatio > 0.35;
    } catch (error) {
      return false;
    }
  }

  /**
   * Cluster checkbox candidates by vertical position
   */
  clusterByVerticalPosition(candidates) {
    if (candidates.length === 0) return [];

    // Sort by y position
    candidates.sort((a, b) => a.y - b.y);

    const clusters = [];
    let currentCluster = [candidates[0]];
    const gapThreshold = 0.04; // 4% gap threshold

    for (let i = 1; i < candidates.length; i++) {
      const prev = candidates[i - 1];
      const curr = candidates[i];

      // If gap is large, start new cluster
      if (curr.y - prev.y > gapThreshold) {
        clusters.push(this.averageCluster(currentCluster));
        currentCluster = [curr];
      } else {
        currentCluster.push(curr);
      }
    }

    if (currentCluster.length > 0) {
      clusters.push(this.averageCluster(currentCluster));
    }

    // Filter clusters with low confidence
    const filteredClusters = clusters.filter(c => c.confidence > this.confidenceThreshold);
    
    return filteredClusters.length > 0 ? filteredClusters : clusters;
  }

  /**
   * Average a cluster of checkboxes
   */
  averageCluster(cluster) {
    const avg = {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      centerX: 0,
      centerY: 0,
      confidence: 0,
    };

    cluster.forEach((c) => {
      avg.x += c.x;
      avg.y += c.y;
      avg.width += c.width;
      avg.height += c.height;
      avg.centerX += c.centerX;
      avg.centerY += c.centerY;
      avg.confidence += c.confidence || 0.5;
    });

    avg.x /= cluster.length;
    avg.y /= cluster.length;
    avg.width /= cluster.length;
    avg.height /= cluster.length;
    avg.centerX /= cluster.length;
    avg.centerY /= cluster.length;
    avg.confidence /= cluster.length;

    return avg;
  }

  /**
   * Create dynamic ROIs from detected clusters
   */
  createDynamicROIs(clusters, warpedCard, config) {
    const dynamicROIs = [];

    // Sort clusters by vertical position
    clusters.sort((a, b) => a.y - b.y);

    // Take top N clusters (matching number of checkboxes in config)
    const numCheckboxes = Math.min(clusters.length, config.checkboxes.length);

    for (let i = 0; i < numCheckboxes; i++) {
      const cluster = clusters[i];
      const originalConfig = config.checkboxes[i];

      // Calculate margins based on cluster size
      const marginX = Math.min(cluster.width * 0.15, 0.01);
      const marginY = Math.min(cluster.height * 0.15, 0.01);

      dynamicROIs.push({
        number: i + 1,
        title: originalConfig ? originalConfig.title : `Checkbox ${i + 1}`,
        roi: {
          x: Math.max(0, cluster.x - marginX),
          y: Math.max(0, cluster.y - marginY),
          width: Math.min(1, cluster.width + marginX * 2),
          height: Math.min(1, cluster.height + marginY * 2),
        },
        detected: true,
        confidence: cluster.confidence || 0.8,
        originalConfig: originalConfig ? { ...originalConfig.roi } : null,
        clusterInfo: {
          centerX: cluster.centerX,
          centerY: cluster.centerY,
          size: cluster.width * cluster.height,
        },
      });
    }

    return dynamicROIs;
  }

  /**
   * Refine dynamic ROIs with additional validation
   */
  refineDynamicROIs(dynamicROIs, warpedCard, config) {
    const refined = [];
    
    for (const roi of dynamicROIs) {
      // Check if ROI is valid
      if (this.isValidROI(roi.roi)) {
        refined.push(roi);
      } else {
        // Fallback to config for invalid ROI
        const originalConfig = config.checkboxes.find(c => c.number === roi.number);
        if (originalConfig) {
          refined.push({
            ...roi,
            roi: { ...originalConfig.roi },
            detected: false,
            confidence: 0.3,
          });
        }
      }
    }

    // Ensure we have the right number of checkboxes
    while (refined.length < config.checkboxes.length) {
      const index = refined.length;
      const originalConfig = config.checkboxes[index];
      if (originalConfig) {
        refined.push({
          number: index + 1,
          title: originalConfig.title || `Checkbox ${index + 1}`,
          roi: { ...originalConfig.roi },
          detected: false,
          confidence: 0.3,
        });
      }
    }

    return refined;
  }

  /**
   * Validate ROI values
   */
  isValidROI(roi) {
    const { x, y, width, height } = roi;
    return (
      x >= 0 && x <= 1 &&
      y >= 0 && y <= 1 &&
      width > 0 && width <= 1 &&
      height > 0 && height <= 1 &&
      x + width <= 1 &&
      y + height <= 1
    );
  }

  /**
   * Verify static ROIs from config
   */
  verifyStaticROIs(config, warpedCard) {
    return config.checkboxes.map((checkbox) => ({
      number: checkbox.number,
      title: checkbox.title,
      roi: { ...checkbox.roi },
      detected: false,
      confidence: 0.5,
    }));
  }

  /**
   * Update detection history
   */
  updateHistory(detectedROIs) {
    this.detectionHistory.push({
      timestamp: Date.now(),
      rois: detectedROIs.map(r => ({
        number: r.number,
        roi: { ...r.roi },
        confidence: r.confidence,
      })),
    });

    // Keep history size in check
    if (this.detectionHistory.length > this.maxHistorySize) {
      this.detectionHistory.shift();
    }

    // Update detected boxes
    this.detectedBoxes = detectedROIs;
  }

  /**
   * Get historical ROIs for a checkbox
   */
  getHistoricalROIs(number, count = 5) {
    const history = [];
    const recent = this.detectionHistory.slice(-count);
    
    for (const entry of recent) {
      const found = entry.rois.find(r => r.number === number);
      if (found) {
        history.push(found.roi);
      }
    }
    
    return history;
  }

  /**
   * Calculate average ROI from history
   */
  getAverageROI(number, count = 5) {
    const history = this.getHistoricalROIs(number, count);
    
    if (history.length === 0) return null;
    
    const avg = {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };
    
    for (const roi of history) {
      avg.x += roi.x;
      avg.y += roi.y;
      avg.width += roi.width;
      avg.height += roi.height;
    }
    
    avg.x /= history.length;
    avg.y /= history.length;
    avg.width /= history.length;
    avg.height /= history.length;
    
    return avg;
  }

  /**
   * Fallback to static config if auto-detection fails
   */
  fallbackToConfig(warpedCard, config) {
    if (this.debugMode) {
      console.warn("⚠️ Using fallback static configuration");
    }
    return config.checkboxes.map((checkbox, index) => ({
      number: checkbox.number,
      title: checkbox.title,
      roi: { ...checkbox.roi },
      detected: false,
      confidence: 0.5,
      fallback: true,
    }));
  }

  /**
   * Reset detector state
   */
  reset() {
    this.detectedBoxes = [];
    this.detectionHistory = [];
    this.checkboxPattern = null;
  }

  /**
   * Get detection statistics
   */
  getStats() {
    const totalDetections = this.detectionHistory.length;
    const avgConfidence = totalDetections > 0
      ? this.detectionHistory.reduce((sum, entry) => {
          const avg = entry.rois.reduce((s, r) => s + (r.confidence || 0), 0) / entry.rois.length;
          return sum + avg;
        }, 0) / totalDetections
      : 0;

    return {
      totalDetections,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      currentBoxes: this.detectedBoxes.length,
      historySize: this.detectionHistory.length,
      stable: totalDetections >= 3,
    };
  }
}

export default AutoCheckboxDetector;
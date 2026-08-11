// utils/dynamicDetector.js – Dynamic ROI adjustment and adaptive thresholding

import { CARD_CONFIG, ConfigHelpers } from '../cards/config.js';

class DynamicDetector {
  constructor(config = null) {
    this.config = config || CARD_CONFIG;
    this.checkboxStates = new Map();
    this.initializeCheckboxStates();
  }

  initializeCheckboxStates() {
    this.config.checkboxes.forEach(cb => {
      this.checkboxStates.set(cb.number, {
        currentRoi: { ...cb.roi }, // Use roi (current working position)
        baseRoi: { ...cb.baseRoi }, // Store base for reference
        fillHistory: [],
        thresholdHistory: [],
        positionHistory: [],
        isChecked: false,
        confidence: 0,
        lastUpdate: Date.now(),
        stableFrames: 0,
      });
    });
  }

  // Main detection method - called for each image frame
  async detectCheckboxes(imageData) {
    const results = [];

    for (const checkbox of this.config.checkboxes) {
      const state = this.checkboxStates.get(checkbox.number);
      
      // Step 1: Fine-tune ROI position based on recent detections
      const adjustedRoi = this.fineTuneROI(checkbox, state, imageData);
      
      // Step 2: Extract the region and analyze fill
      const region = this.extractRegion(imageData, adjustedRoi);
      
      // Step 3: Calculate adaptive threshold for this specific region
      const adaptiveThreshold = this.calculateAdaptiveThreshold(region, checkbox, state);
      
      // Step 4: Detect fill percentage with adaptive threshold
      const fillResult = this.detectFillPercentage(region, adaptiveThreshold);
      
      // Step 5: Update state with new data
      this.updateCheckboxState(state, fillResult, adjustedRoi, adaptiveThreshold);
      
      // Step 6: Determine if checkbox is checked based on dynamic criteria
      const isChecked = this.determineCheckedState(fillResult, state);
      
      // Get base ROI for adjustment calculation
      const baseRoi = checkbox.baseRoi || checkbox.roi;
      
      results.push({
        number: checkbox.number,
        title: checkbox.title,
        roi: adjustedRoi,
        fillPercentage: fillResult.percentage,
        confidence: fillResult.confidence,
        isChecked: isChecked,
        threshold: adaptiveThreshold,
        dynamicAdjustments: {
          xOffset: adjustedRoi.x - baseRoi.x,
          yOffset: adjustedRoi.y - baseRoi.y,
          xOffsetPercent: ((adjustedRoi.x - baseRoi.x) * 100).toFixed(2),
          yOffsetPercent: ((adjustedRoi.y - baseRoi.y) * 100).toFixed(2),
        },
        stability: state.stableFrames,
      });
    }

    return results;
  }

  // Dynamically fine-tune ROI position based on detection history
  fineTuneROI(checkbox, state, imageData) {
    const baseRoi = checkbox.baseRoi || checkbox.roi;
    const currentRoi = state.currentRoi || baseRoi;
    const history = state.fillHistory;
    const positionHistory = state.positionHistory || [];
    
    // If we have enough history, try to optimize position
    if (history.length >= 3 && positionHistory.length >= 2) {
      // Analyze gradient patterns around the ROI to find the optimal position
      const gradientMap = this.analyzeGradients(imageData, currentRoi);
      
      // Find the position that maximizes fill consistency
      const optimalOffset = this.findOptimalOffset(gradientMap, checkbox.adjustment || { xRange: 0.02, yRange: 0.02 });
      
      // Apply the offset with smoothing
      const smoothing = checkbox.adjustment?.learningRate || 0.3;
      const adjustedX = currentRoi.x + optimalOffset.x * smoothing;
      const adjustedY = currentRoi.y + optimalOffset.y * smoothing;
      
      // Clamp to valid range within adjustment limits
      const xRange = checkbox.adjustment?.xRange || 0.02;
      const yRange = checkbox.adjustment?.yRange || 0.02;
      
      return {
        x: Math.max(baseRoi.x - xRange, Math.min(baseRoi.x + xRange, adjustedX)),
        y: Math.max(baseRoi.y - yRange, Math.min(baseRoi.y + yRange, adjustedY)),
        width: baseRoi.width,
        height: baseRoi.height,
      };
    }
    
    // Return current ROI if not enough history
    return { ...currentRoi };
  }

  // Analyze image gradients to find the exact checkbox position
  analyzeGradients(imageData, roi) {
    const { width, height } = roi;
    const searchRange = 0.015; // Search in a small area around the ROI
    
    // Sample gradients in a small grid around the ROI
    const gradients = [];
    const steps = 5;
    
    for (let i = -steps; i <= steps; i++) {
      for (let j = -steps; j <= steps; j++) {
        const sampleX = roi.x + (i / steps) * searchRange;
        const sampleY = roi.y + (j / steps) * searchRange;
        
        // Sample the gradient at this position
        const grad = this.sampleGradient(imageData, sampleX, sampleY, width, height);
        gradients.push({
          x: sampleX,
          y: sampleY,
          gradient: grad,
        });
      }
    }
    
    return gradients;
  }

  // Sample image gradient at a specific position
  sampleGradient(imageData, x, y, width, height) {
    // Convert normalized coordinates to pixel coordinates
    const imgWidth = imageData.width || 600;
    const imgHeight = imageData.height || 1000;
    
    const px = Math.floor(x * imgWidth);
    const py = Math.floor(y * imgHeight);
    const pw = Math.floor(width * imgWidth);
    const ph = Math.floor(height * imgHeight);
    
    // Sample the region
    const data = imageData.data;
    let totalGradient = 0;
    let samples = 0;
    
    // Simple edge detection using Sobel-like approach
    for (let row = 0; row < ph; row += 2) {
      for (let col = 0; col < pw; col += 2) {
        const idx = ((py + row) * imgWidth + (px + col)) * 4;
        if (idx + 4 >= data.length) continue;
        
        // Calculate grayscale value
        const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        
        // Check horizontal and vertical neighbors for edges
        const idxRight = ((py + row) * imgWidth + (px + col + 1)) * 4;
        const idxDown = ((py + row + 1) * imgWidth + (px + col)) * 4;
        
        if (idxRight + 4 < data.length && idxDown + 4 < data.length) {
          const grayRight = (data[idxRight] + data[idxRight + 1] + data[idxRight + 2]) / 3;
          const grayDown = (data[idxDown] + data[idxDown + 1] + data[idxDown + 2]) / 3;
          
          const gradX = Math.abs(gray - grayRight);
          const gradY = Math.abs(gray - grayDown);
          totalGradient += (gradX + gradY) / 2;
          samples++;
        }
      }
    }
    
    return samples > 0 ? totalGradient / samples : 0;
  }

  // Find optimal offset based on gradient analysis
  findOptimalOffset(gradientMap, adjustment) {
    if (!gradientMap || gradientMap.length === 0) {
      return { x: 0, y: 0 };
    }
    
    // Find the position with strongest gradient (edge)
    const maxGradient = gradientMap.reduce((max, g) => 
      g.gradient > max.gradient ? g : max
    , gradientMap[0]);
    
    // Calculate offset from the average position
    const avgX = gradientMap.reduce((sum, g) => sum + g.x, 0) / gradientMap.length;
    const avgY = gradientMap.reduce((sum, g) => sum + g.y, 0) / gradientMap.length;
    
    // Return offset toward the strongest gradient position
    const offsetX = (maxGradient.x - avgX) * 0.5;
    const offsetY = (maxGradient.y - avgY) * 0.5;
    
    // Clamp to adjustment range
    const xRange = adjustment?.xRange || 0.02;
    const yRange = adjustment?.yRange || 0.02;
    
    return {
      x: Math.max(-xRange, Math.min(xRange, offsetX)),
      y: Math.max(-yRange, Math.min(yRange, offsetY)),
    };
  }

  // Calculate adaptive threshold for the region
  calculateAdaptiveThreshold(region, checkbox, state) {
    const adaptiveConfig = this.config.detection?.adaptiveThreshold;
    
    if (!adaptiveConfig?.enabled) {
      return this.config.detection?.globalThreshold || 128;
    }
    
    // Calculate local statistics
    const stats = this.calculateRegionStats(region);
    
    // Use Otsu's method as adaptive threshold
    let otsuThreshold = this.otsuThreshold(region);
    
    // Blend with historical data
    if (state.thresholdHistory && state.thresholdHistory.length > 0) {
      const historyAvg = state.thresholdHistory.reduce((a, b) => a + b, 0) / state.thresholdHistory.length;
      const otsuWeight = adaptiveConfig.otsuWeight || 0.6;
      otsuThreshold = otsuThreshold * otsuWeight + historyAvg * (1 - otsuWeight);
    }
    
    // Apply min/max constraints
    return Math.max(
      adaptiveConfig.minThreshold || 100,
      Math.min(adaptiveConfig.maxThreshold || 180, otsuThreshold)
    );
  }

  // Otsu's method for optimal threshold calculation
  otsuThreshold(region) {
    // Build histogram
    const histogram = new Array(256).fill(0);
    let totalPixels = 0;
    
    for (let i = 0; i < region.length; i++) {
      const val = region[i];
      histogram[val]++;
      totalPixels++;
    }
    
    if (totalPixels === 0) return 128;
    
    // Calculate total mean
    let totalMean = 0;
    for (let i = 0; i < 256; i++) {
      totalMean += i * histogram[i];
    }
    totalMean /= totalPixels;
    
    // Calculate between-class variance for each threshold
    let bestThreshold = 128;
    let bestVariance = 0;
    let weightBack = 0;
    let meanBack = 0;
    
    for (let t = 0; t < 256; t++) {
      weightBack += histogram[t];
      if (weightBack === 0) continue;
      
      const weightFore = totalPixels - weightBack;
      if (weightFore === 0) break;
      
      meanBack = (meanBack * (weightBack - histogram[t]) + t * histogram[t]) / weightBack;
      
      // Calculate foreground mean
      let meanFore = 0;
      for (let i = t + 1; i < 256; i++) {
        meanFore += i * histogram[i];
      }
      meanFore /= weightFore;
      
      const variance = weightBack * weightFore * Math.pow(meanBack - meanFore, 2);
      
      if (variance > bestVariance) {
        bestVariance = variance;
        bestThreshold = t;
      }
    }
    
    return bestThreshold;
  }

  // Calculate region statistics for adaptive thresholding
  calculateRegionStats(region) {
    if (!region || region.length === 0) {
      return { mean: 128, variance: 0, stdDev: 0, min: 0, max: 255, dynamicRange: 255 };
    }
    
    let sum = 0;
    let sumSq = 0;
    let min = 255;
    let max = 0;
    
    for (const val of region) {
      sum += val;
      sumSq += val * val;
      min = Math.min(min, val);
      max = Math.max(max, val);
    }
    
    const mean = sum / region.length;
    const variance = (sumSq / region.length) - (mean * mean);
    
    return {
      mean,
      variance,
      stdDev: Math.sqrt(variance),
      min,
      max,
      dynamicRange: max - min,
    };
  }

  // Extract region from image data
  extractRegion(imageData, roi) {
    const imgWidth = imageData.width || 600;
    const imgHeight = imageData.height || 1000;
    
    const x = Math.floor(roi.x * imgWidth);
    const y = Math.floor(roi.y * imgHeight);
    const w = Math.floor(roi.width * imgWidth);
    const h = Math.floor(roi.height * imgHeight);
    
    const region = [];
    const data = imageData.data;
    
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const idx = ((y + row) * imgWidth + (x + col)) * 4;
        if (idx + 3 < data.length) {
          // Convert to grayscale
          const gray = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
          region.push(Math.round(gray));
        }
      }
    }
    
    return region;
  }

  // Detect fill percentage with adaptive threshold
  detectFillPercentage(region, threshold) {
    let filledPixels = 0;
    let totalPixels = region.length;
    
    // Check if region is empty or invalid
    if (totalPixels === 0) {
      return { percentage: 0, confidence: 0, filledPixels: 0, totalPixels: 0 };
    }
    
    // Count pixels below threshold (assuming filled = darker)
    for (const pixel of region) {
      if (pixel < threshold) {
        filledPixels++;
      }
    }
    
    const percentage = (filledPixels / totalPixels) * 100;
    
    // Calculate confidence based on variance and separation
    const stats = this.calculateRegionStats(region);
    const separation = Math.abs(stats.mean - threshold) / (stats.stdDev + 1);
    const confidence = Math.min(100, Math.max(0, separation * 20));
    
    return {
      percentage: Math.round(percentage * 10) / 10,
      confidence: Math.round(confidence * 10) / 10,
      filledPixels,
      totalPixels,
    };
  }

  // Update checkbox state with new detection results
  updateCheckboxState(state, fillResult, roi, threshold) {
    // Update fill history
    if (!state.fillHistory) state.fillHistory = [];
    state.fillHistory.push(fillResult.percentage);
    const maxHistory = this.config.checkboxes[0]?.history?.maxHistory || 20;
    if (state.fillHistory.length > maxHistory) {
      state.fillHistory.shift();
    }
    
    // Update threshold history
    if (!state.thresholdHistory) state.thresholdHistory = [];
    state.thresholdHistory.push(threshold);
    if (state.thresholdHistory.length > maxHistory) {
      state.thresholdHistory.shift();
    }
    
    // Update position history
    if (!state.positionHistory) state.positionHistory = [];
    state.positionHistory.push({ ...roi });
    if (state.positionHistory.length > maxHistory) {
      state.positionHistory.shift();
    }
    
    // Update ROI with smoothing
    state.currentRoi = {
      x: state.currentRoi?.x ? state.currentRoi.x * 0.7 + roi.x * 0.3 : roi.x,
      y: state.currentRoi?.y ? state.currentRoi.y * 0.7 + roi.y * 0.3 : roi.y,
      width: roi.width,
      height: roi.height,
    };
    
    state.lastUpdate = Date.now();
    state.confidence = fillResult.confidence;
    
    // Update stability counter
    if (fillResult.confidence > 70) {
      state.stableFrames = (state.stableFrames || 0) + 1;
    } else {
      state.stableFrames = 0;
    }
  }

  // Determine if checkbox is checked based on dynamic criteria
  determineCheckedState(fillResult, state) {
    const config = this.config.detection;
    if (!config) return false;
    
    const fill = fillResult.percentage;
    
    // Base check: fill percentage within expected range
    let isChecked = fill >= (config.minFillPercentage || 30) && 
                   fill <= (config.maxFillPercentage || 100);
    
    // Enhanced: use confidence
    if (fillResult.confidence < (config.minConfidence || 30)) {
      isChecked = false;
    }
    
    // Consider historical consistency
    if (state.fillHistory && state.fillHistory.length >= 3) {
      const recentFills = state.fillHistory.slice(-3);
      const avgFill = recentFills.reduce((a, b) => a + b, 0) / recentFills.length;
      const variance = recentFills.reduce((a, b) => a + Math.pow(b - avgFill, 2), 0) / recentFills.length;
      
      // If recent detections are inconsistent, be cautious
      if (variance > 100) {
        isChecked = false;
      }
    }
    
    return isChecked;
  }

  // Get current state for a checkbox
  getState(number) {
    return this.checkboxStates.get(number);
  }

  // Reset state for a checkbox
  resetState(number) {
    const checkbox = this.config.checkboxes.find(cb => cb.number === number);
    if (checkbox) {
      this.checkboxStates.set(number, {
        currentRoi: { ...checkbox.roi },
        baseRoi: { ...checkbox.baseRoi || checkbox.roi },
        fillHistory: [],
        thresholdHistory: [],
        positionHistory: [],
        isChecked: false,
        confidence: 0,
        lastUpdate: Date.now(),
        stableFrames: 0,
      });
      return true;
    }
    return false;
  }

  // Reset all states
  resetAllStates() {
    this.initializeCheckboxStates();
  }

  // Utility: Convert fill percentage to visual representation
  getFillLevel(fillPercentage) {
    if (fillPercentage < 20) return 'empty';
    if (fillPercentage < 40) return 'low';
    if (fillPercentage < 60) return 'medium';
    if (fillPercentage < 80) return 'high';
    return 'full';
  }
}

export default DynamicDetector;
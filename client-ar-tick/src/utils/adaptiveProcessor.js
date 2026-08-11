// utils/adaptiveProcessor.js
// Dynamic ROI adjustment based on fill patterns and detection history

import { ConfigHelpers } from '../cards/config.js';

export class AdaptiveProcessor {
  constructor(config, options = {}) {
    this.config = config;
    this.buffer = new Map();
    this.adjustmentHistory = [];
    this.learningRate = options.learningRate || 0.3;
    this.minConfidence = options.minConfidence || 50;
    this.maxHistorySize = options.maxHistorySize || 20;
    this.stabilizationFrames = options.stabilizationFrames || 3;
    this.debugMode = options.debugMode || false;
    
    // Track stable adjustments
    this.stableCount = new Map();
    this.lastAdjustment = new Map();
  }

  /**
   * Process detection results and suggest ROI adjustments
   */
  processResults(results, isDynamicMode = true) {
    const adjustments = [];
    
    if (!isDynamicMode) {
      // In static mode, just collect data without suggesting adjustments
      for (const result of results) {
        this.collectData(result);
      }
      return adjustments;
    }

    for (const result of results) {
      const key = result.number;
      
      // Skip low confidence detections
      if (result.confidence < this.minConfidence) {
        if (this.debugMode) {
          console.log(`⚠️ Skipping #${key} - low confidence: ${result.confidence}`);
        }
        continue;
      }
      
      // Initialize buffer for this checkbox
      if (!this.buffer.has(key)) {
        this.buffer.set(key, []);
        this.stableCount.set(key, 0);
        this.lastAdjustment.set(key, { x: 0, y: 0 });
      }
      
      const history = this.buffer.get(key);
      
      // Add new data point
      history.push({
        fill: result.fillPercentage,
        roi: { ...result.roi },
        confidence: result.confidence,
        timestamp: Date.now(),
        threshold: result.threshold,
        isChecked: result.isChecked,
      });
      
      // Keep history size in check
      while (history.length > this.maxHistorySize) {
        history.shift();
      }
      
      // If we have enough data, suggest adjustment
      if (history.length >= this.stabilizationFrames) {
        const adjustment = this.suggestAdjustment(history, key);
        if (adjustment) {
          // Verify adjustment is significant
          const currentAdj = this.lastAdjustment.get(key);
          const dx = Math.abs(adjustment.direction.x - currentAdj.x);
          const dy = Math.abs(adjustment.direction.y - currentAdj.y);
          
          // Only apply if adjustment is significant enough
          if (dx > 0.001 || dy > 0.001) {
            adjustments.push({
              number: key,
              ...adjustment,
              applied: false,
            });
            
            // Update last adjustment
            this.lastAdjustment.set(key, {
              x: adjustment.direction.x,
              y: adjustment.direction.y,
            });
            
            // Reset stable count for this key
            this.stableCount.set(key, 0);
          } else {
            // Increment stable count
            const count = (this.stableCount.get(key) || 0) + 1;
            this.stableCount.set(key, count);
            
            // If stable for multiple frames, consider adjustment applied
            if (count >= this.stabilizationFrames) {
              adjustments.push({
                number: key,
                type: 'position_adjustment',
                direction: { x: 0, y: 0 },
                magnitude: 0,
                confidence: 100,
                applied: true,
                stable: true,
              });
            }
          }
        }
      }
    }
    
    // Track adjustment history
    if (adjustments.length > 0) {
      this.adjustmentHistory.push({
        timestamp: Date.now(),
        adjustments: adjustments.map(a => ({ ...a })),
      });
      
      // Keep history size in check
      while (this.adjustmentHistory.length > 50) {
        this.adjustmentHistory.shift();
      }
    }
    
    if (this.debugMode && adjustments.length > 0) {
      console.log(`🔄 Adaptive processor suggested ${adjustments.length} adjustment(s)`);
    }
    
    return adjustments;
  }

  /**
   * Collect data without suggesting adjustments (for static mode)
   */
  collectData(result) {
    const key = result.number;
    if (!this.buffer.has(key)) {
      this.buffer.set(key, []);
    }
    
    const history = this.buffer.get(key);
    history.push({
      fill: result.fillPercentage,
      roi: { ...result.roi },
      confidence: result.confidence,
      timestamp: Date.now(),
      threshold: result.threshold,
      isChecked: result.isChecked,
    });
    
    while (history.length > this.maxHistorySize) {
      history.shift();
    }
  }

  /**
   * Suggest adjustment based on history
   */
  suggestAdjustment(history, key) {
    if (history.length < 3) return null;
    
    // Extract data
    const fills = history.map(h => h.fill);
    const rois = history.map(h => h.roi);
    const confidences = history.map(h => h.confidence);
    const thresholds = history.map(h => h.threshold || 128);
    
    // Calculate statistics
    const avgFill = this.calculateAverage(fills);
    const variance = this.calculateVariance(fills, avgFill);
    const avgConfidence = this.calculateAverage(confidences);
    const avgThreshold = this.calculateAverage(thresholds);
    const fillTrend = this.calculateTrend(fills);
    
    // Check if we need adjustment
    const needsAdjustment = this.needsAdjustment(avgFill, variance, fillTrend, avgConfidence);
    
    if (!needsAdjustment) {
      return null;
    }
    
    // Determine adjustment direction and magnitude
    const direction = this.determineDirection(fills, rois, fillTrend);
    const magnitude = this.calculateMagnitude(variance, avgFill);
    const confidence = this.calculateAdjustmentConfidence(variance, avgConfidence, fillTrend);
    
    return {
      type: 'position_adjustment',
      direction: direction,
      magnitude: Math.min(0.01, Math.max(0.0005, magnitude)),
      confidence: Math.min(100, Math.max(50, confidence)),
      reason: this.getAdjustmentReason(avgFill, variance, fillTrend),
      stats: {
        avgFill,
        variance,
        avgConfidence,
        avgThreshold,
        sampleSize: history.length,
      },
    };
  }

  /**
   * Check if adjustment is needed
   */
  needsAdjustment(avgFill, variance, trend, avgConfidence) {
    // If confidence is too low, don't adjust
    if (avgConfidence < this.minConfidence) {
      return false;
    }
    
    // If fill is too extreme
    if (avgFill > 80 || avgFill < 20) {
      return true;
    }
    
    // If variance is high (inconsistent)
    if (variance > 150) {
      return true;
    }
    
    // If there's a clear trend
    if (Math.abs(trend) > 5) {
      return true;
    }
    
    return false;
  }

  /**
   * Determine adjustment direction
   */
  determineDirection(fills, rois, trend) {
    const avgFill = this.calculateAverage(fills);
    const recentFills = fills.slice(-3);
    const avgRecent = this.calculateAverage(recentFills);
    
    let xDirection = 0;
    let yDirection = 0;
    
    // If fill is too high, move away from center
    if (avgFill > 70) {
      // Check if trend is going up
      if (trend > 2) {
        yDirection = -0.5; // Move up slightly
      } else if (trend < -2) {
        yDirection = 0.5; // Move down slightly
      } else {
        yDirection = -0.3; // Default move up
      }
    }
    
    // If fill is too low, move toward center
    if (avgFill < 30) {
      if (trend > 2) {
        yDirection = 0.5; // Move down slightly
      } else if (trend < -2) {
        yDirection = -0.5; // Move up slightly
      } else {
        yDirection = 0.3; // Default move down
      }
    }
    
    // Adjust x based on fill consistency
    const variance = this.calculateVariance(fills, avgFill);
    if (variance > 100) {
      xDirection = (Math.random() - 0.5) * 0.5; // Random small x adjustment
    }
    
    // Normalize direction
    const magnitude = Math.sqrt(xDirection * xDirection + yDirection * yDirection);
    if (magnitude > 0) {
      xDirection = xDirection / magnitude;
      yDirection = yDirection / magnitude;
    }
    
    return {
      x: Math.max(-1, Math.min(1, xDirection)),
      y: Math.max(-1, Math.min(1, yDirection)),
    };
  }

  /**
   * Calculate adjustment magnitude
   */
  calculateMagnitude(variance, avgFill) {
    // Base magnitude on variance
    let magnitude = variance / 20000;
    
    // Adjust based on fill extremity
    if (avgFill > 80) {
      magnitude += 0.002;
    }
    if (avgFill < 20) {
      magnitude += 0.002;
    }
    
    // Clamp magnitude
    return Math.min(0.01, Math.max(0.0005, magnitude));
  }

  /**
   * Calculate adjustment confidence
   */
  calculateAdjustmentConfidence(variance, avgConfidence, trend) {
    let confidence = avgConfidence;
    
    // Reduce confidence for high variance
    if (variance > 100) {
      confidence -= (variance - 100) / 5;
    }
    
    // Reduce confidence for unclear trend
    if (Math.abs(trend) < 2) {
      confidence -= 10;
    }
    
    // Clamp confidence
    return Math.min(100, Math.max(50, confidence));
  }

  /**
   * Get reason for adjustment
   */
  getAdjustmentReason(avgFill, variance, trend) {
    const reasons = [];
    
    if (avgFill > 80) reasons.push('fill_too_high');
    if (avgFill < 20) reasons.push('fill_too_low');
    if (variance > 150) reasons.push('high_variance');
    if (Math.abs(trend) > 5) reasons.push('strong_trend');
    
    return reasons.length > 0 ? reasons.join(', ') : 'general_optimization';
  }

  /**
   * Calculate average of array
   */
  calculateAverage(arr) {
    return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  }

  /**
   * Calculate variance of array
   */
  calculateVariance(arr, mean) {
    if (arr.length < 2) return 0;
    const squaredDiffs = arr.map(v => Math.pow(v - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / (arr.length - 1);
  }

  /**
   * Calculate trend (slope) of data
   */
  calculateTrend(arr) {
    if (arr.length < 3) return 0;
    
    const n = arr.length;
    const indices = Array.from({ length: n }, (_, i) => i);
    
    // Simple linear regression
    const sumX = indices.reduce((a, b) => a + b, 0);
    const sumY = arr.reduce((a, b) => a + b, 0);
    const sumXY = indices.reduce((a, b, i) => a + b * arr[i], 0);
    const sumX2 = indices.reduce((a, b) => a + b * b, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope;
  }

  /**
   * Check if ROI is stable
   */
  isStable(number) {
    const count = this.stableCount.get(number) || 0;
    return count >= this.stabilizationFrames;
  }

  /**
   * Get recent adjustments for a checkbox
   */
  getRecentAdjustments(number, count = 5) {
    const adjustments = [];
    const history = this.adjustmentHistory.slice(-count);
    
    for (const entry of history) {
      const found = entry.adjustments.find(a => a.number === number);
      if (found) {
        adjustments.push(found);
      }
    }
    
    return adjustments;
  }

  /**
   * Get adjustment statistics
   */
  getStats() {
    const totalAdjustments = this.adjustmentHistory.length;
    const recentAdjustments = this.adjustmentHistory.slice(-10);
    
    const appliedCount = recentAdjustments.reduce((sum, entry) => {
      return sum + entry.adjustments.filter(a => a.applied).length;
    }, 0);
    
    const pendingCount = recentAdjustments.reduce((sum, entry) => {
      return sum + entry.adjustments.filter(a => !a.applied).length;
    }, 0);
    
    return {
      totalAdjustments,
      appliedCount,
      pendingCount,
      averageConfidence: this.calculateAverage(
        this.adjustmentHistory.flatMap(entry => 
          entry.adjustments.map(a => a.confidence || 0)
        )
      ),
      buffers: Array.from(this.buffer.entries()).map(([key, data]) => ({
        number: key,
        size: data.length,
        latestFill: data.length > 0 ? data[data.length - 1].fill : null,
        avgFill: data.length > 0 ? this.calculateAverage(data.map(d => d.fill)) : null,
      })),
    };
  }

  /**
   * Reset processor state
   */
  reset() {
    this.buffer.clear();
    this.adjustmentHistory = [];
    this.stableCount.clear();
    this.lastAdjustment.clear();
    
    if (this.debugMode) {
      console.log('🔄 Adaptive processor reset');
    }
  }

  /**
   * Reset buffer for a specific checkbox
   */
  resetBuffer(number) {
    if (this.buffer.has(number)) {
      this.buffer.delete(number);
      this.stableCount.delete(number);
      this.lastAdjustment.delete(number);
      
      if (this.debugMode) {
        console.log(`🔄 Reset buffer for checkbox #${number}`);
      }
      return true;
    }
    return false;
  }
}

export default AdaptiveProcessor;
// client-arkick/src/cards/config.js
// Enhanced configuration with dynamic detection support - UPDATED WITH ACCURATE POSITIONS

export const CARD_CONFIG = {
  // Card dimensions
  cardWidth: 600,
  cardHeight: 1000,
  referenceImage: "/cards/eatingStyle/reference.jpg",

  // Checkbox definitions with dynamic adjustment metadata
  checkboxes: [
    {
      number: 1,
      title: "I Eat While Distracted",
      roi: {
        x: 0.105,    // ~10.5% from left edge (based on correct detection)
        y: 0.46,     // ~46% from top (based on correct detection)
        width: 0.065, // 6.5% width
        height: 0.045, // 4.5% height
      },
      // Dynamic adjustment parameters for this checkbox
      dynamic: {
        enabled: true,
        xRange: 0.025,     // ±2.5% horizontal adjustment range (slightly larger)
        yRange: 0.025,     // ±2.5% vertical adjustment range
        step: 0.001,       // 0.1% step size for fine-tuning
        learningRate: 0.25, // Slightly lower learning rate for stability
        confidenceThreshold: 55, // Minimum confidence to apply adjustment
      },
      // Historical data tracking
      history: {
        fills: [],
        thresholds: [],
        positions: [],
        maxHistory: 20,
      },
    },
    {
      number: 2,
      title: "I Eat In A Hurry",
      roi: {
        x: 0.105,    // ~10.5% from left edge
        y: 0.61,     // ~61% from top (based on correct detection)
        width: 0.065, // 6.5% width
        height: 0.045, // 4.5% height
      },
      dynamic: {
        enabled: true,
        xRange: 0.025,
        yRange: 0.025,
        step: 0.001,
        learningRate: 0.25,
        confidenceThreshold: 55,
      },
      history: {
        fills: [],
        thresholds: [],
        positions: [],
        maxHistory: 20,
      },
    },
    {
      number: 3,
      title: "I Eat Mindfully",
      roi: {
        x: 0.105,    // ~10.5% from left edge
        y: 0.76,     // ~76% from top (based on correct detection)
        width: 0.063, // 6.3% width
        height: 0.040, // 4.0% height
      },
      dynamic: {
        enabled: true,
        xRange: 0.025,
        yRange: 0.025,
        step: 0.001,
        learningRate: 0.25,
        confidenceThreshold: 55,
      },
      history: {
        fills: [],
        thresholds: [],
        positions: [],
        maxHistory: 20,
      },
    },
  ],

  // Detection settings - OPTIMIZED FOR ACCURACY
  detection: {
    margin: 15,                    // Increased tolerance for better detection
    minConfidence: 35,             // Slightly higher minimum confidence
    maxFillPercentage: 100,        // Maximum fill percentage for checkbox
    minFillPercentage: 25,         // Lowered to catch lighter checkboxes
    globalThreshold: 120,          // Slightly lower default threshold
    
    // Adaptive threshold settings
    adaptiveThreshold: {
      enabled: true,
      windowSize: 7,               // Increased for more stable thresholds
      sensitivity: 0.12,           // Slightly lower sensitivity
      minThreshold: 90,
      maxThreshold: 190,
      otsuWeight: 0.65,            // More weight on Otsu vs historical
    },
    
    // Dynamic ROI adjustment settings
    dynamicROI: {
      enabled: true,
      smoothing: 0.25,             // More smoothing for stability
      minAdjustment: 0.0005,       // Minimum adjustment to apply
      maxAdjustment: 0.004,        // Slightly reduced maximum adjustment
      stabilizationFrames: 4,      // More frames needed to confirm adjustment
      decayRate: 0.99,             // Slower decay for more stability
    },
    
    // Confidence scoring settings
    confidence: {
      minConfidence: 35,
      maxConfidence: 100,
      variancePenalty: 0.4,        // Lower penalty for variance
      consistencyBonus: 0.35,      // Higher bonus for consistency
    },
  },

  // Debug settings
  debug: {
    showROIs: true,
    showConfidence: true,
    showAdjustments: true,
    showHistory: true,
    overlayOpacity: 0.7,
    colors: {
      checked: "#00ff00",
      unchecked: "#ff0000",
      lowConfidence: "#ffaa00",
      adjustment: "#ff8800",
      grid: "rgba(255,255,255,0.1)",
    },
  },

  // Performance settings
  performance: {
    dynamicFrameInterval: 350,    // Slightly slower for better accuracy
    staticFrameInterval: 100,     // Faster when in static mode
    maxConcurrentDetections: 3,   // Max detections per frame
    cacheResults: true,           // Cache detection results
    cacheTTL: 1500,               // Longer cache TTL
  },
};

// Export helper functions for config management
export const ConfigHelpers = {
  // Get checkbox by number
  getCheckbox: (number) => {
    return CARD_CONFIG.checkboxes.find(cb => cb.number === number);
  },

  // Update ROI for a checkbox
  updateROI: (number, newROI) => {
    const checkbox = CARD_CONFIG.checkboxes.find(cb => cb.number === number);
    if (checkbox) {
      checkbox.roi = { ...checkbox.roi, ...newROI };
      return true;
    }
    return false;
  },

  // Get dynamic settings for a checkbox
  getDynamicSettings: (number) => {
    const checkbox = CARD_CONFIG.checkboxes.find(cb => cb.number === number);
    return checkbox?.dynamic || null;
  },

  // Check if dynamic mode is enabled for a checkbox
  isDynamicEnabled: (number) => {
    const checkbox = CARD_CONFIG.checkboxes.find(cb => cb.number === number);
    return checkbox?.dynamic?.enabled !== false;
  },

  // Get all checkbox ROIs
  getAllROIs: () => {
    return CARD_CONFIG.checkboxes.map(cb => ({
      number: cb.number,
      ...cb.roi,
    }));
  },

  // Reset all ROIs to base positions
  resetAllROIs: () => {
    const baseROIs = {
      1: { x: 0.105, y: 0.46, width: 0.065, height: 0.045 },
      2: { x: 0.105, y: 0.61, width: 0.065, height: 0.045 },
      3: { x: 0.105, y: 0.76, width: 0.063, height: 0.040 },
    };
    CARD_CONFIG.checkboxes.forEach(cb => {
      if (baseROIs[cb.number]) {
        cb.roi = { ...baseROIs[cb.number] };
      }
    });
  },

  // Validate ROI values
  validateROI: (roi) => {
    const { x, y, width, height } = roi;
    return (
      x >= 0 && x <= 1 &&
      y >= 0 && y <= 1 &&
      width > 0 && width <= 1 &&
      height > 0 && height <= 1 &&
      x + width <= 1 &&
      y + height <= 1
    );
  },

  // Get default threshold
  getDefaultThreshold: () => {
    return CARD_CONFIG.detection.globalThreshold;
  },

  // Get adaptive threshold settings
  getAdaptiveThresholdSettings: () => {
    return CARD_CONFIG.detection.adaptiveThreshold;
  },

  // Check if detection should use adaptive thresholds
  useAdaptiveThreshold: () => {
    return CARD_CONFIG.detection.adaptiveThreshold?.enabled !== false;
  },

  // Get performance settings
  getPerformanceSettings: () => {
    return CARD_CONFIG.performance;
  },

  // Get frame interval based on mode
  getFrameInterval: (isDynamicMode) => {
    const perf = CARD_CONFIG.performance;
    return isDynamicMode ? perf.dynamicFrameInterval : perf.staticFrameInterval;
  },

  // Get recommended ROI for a checkbox based on card type
  getRecommendedROI: (number, cardType = 'eatingStyle') => {
    const recommendations = {
      eatingStyle: {
        1: { x: 0.105, y: 0.46, width: 0.065, height: 0.045 },
        2: { x: 0.105, y: 0.61, width: 0.065, height: 0.045 },
        3: { x: 0.105, y: 0.76, width: 0.063, height: 0.040 },
      }
    };
    return recommendations[cardType]?.[number] || null;
  },
};

// Export for backward compatibility
export default CARD_CONFIG;
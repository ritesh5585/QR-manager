// DebugOverlay.js - Live Debug with Real-time Adjustments & Dynamic Detection

import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const DebugOverlay = ({ 
  debugInfo, 
  onClose, 
  onUpdateConfig,
  onDynamicAdjust,
  isDynamicMode = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [editingIndex, setEditingIndex] = useState(null);
  const [activeTab, setActiveTab] = useState('roi'); // 'roi' | 'dynamic' | 'history'
  const canvasRef = useRef(null);
  const [liveROIs, setLiveROIs] = useState([]);
  const [adjustmentHistory, setAdjustmentHistory] = useState([]);
  const [detectionStats, setDetectionStats] = useState({
    avgConfidence: 0,
    consistency: 0,
    adjustments: 0,
  });
  
  // Reference to store dynamic adjustments
  const [dynamicAdjustments, setDynamicAdjustments] = useState({});

  if (!debugInfo) return null;

  const {
    checkboxes = [],
    warpedImage,
    imageSize,
    warpedSize,
    globalThreshold,
    baseline,
    margin,
    checkboxROIs = [],
    detectionResults = [],
  } = debugInfo;

  const checkedCount = checkboxes.filter((b) => b.isChecked).length;
  
  // Initialize live ROIs from debugInfo
  useEffect(() => {
    if (checkboxROIs.length > 0) {
      setLiveROIs(checkboxROIs);
    }
  }, [checkboxROIs]);

  // Update detection stats
  useEffect(() => {
    if (detectionResults.length > 0) {
      const avgConf = detectionResults.reduce((sum, r) => sum + (r.confidence || 0), 0) / detectionResults.length;
      const consistency = detectionResults.reduce((sum, r) => sum + (r.consistency || 0), 0) / detectionResults.length;
      
      setDetectionStats({
        avgConfidence: Math.round(avgConf),
        consistency: Math.round(consistency),
        adjustments: detectionResults.filter(r => r.adjusted).length,
      });
    }
  }, [detectionResults]);

  // Draw warped card with ROIs and dynamic overlay
  useEffect(() => {
    if (!warpedImage || !liveROIs.length || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      // Draw each ROI with dynamic information
      liveROIs.forEach((roi, index) => {
        const result = checkboxes.find(c => c.number === roi.number);
        const dynamicResult = detectionResults.find(r => r.number === roi.number);
        const roiX = roi.x * canvas.width;
        const roiY = roi.y * canvas.height;
        const roiW = roi.width * canvas.width;
        const roiH = roi.height * canvas.height;

        const isChecked = result?.isChecked || false;
        const confidence = dynamicResult?.confidence || 0;
        const fillPercentage = dynamicResult?.fillPercentage || result?.fillPercentage || 0;
        
        // Color based on confidence and check state
        let color = '#00ff00';
        let borderColor = 'rgba(0,255,0,0.3)';
        if (!isChecked) {
          color = '#ff0000';
          borderColor = 'rgba(255,0,0,0.3)';
        }
        if (confidence < 50 && isChecked) {
          color = '#ffaa00';
          borderColor = 'rgba(255,170,0,0.3)';
        }

        // Draw ROI rectangle with dynamic glow
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = confidence > 70 ? 20 : 10;
        ctx.strokeStyle = color;
        ctx.lineWidth = isDynamicMode ? 3 : 2;
        ctx.setLineDash(isDynamicMode ? [8, 4] : [5, 5]);
        ctx.strokeRect(roiX, roiY, roiW, roiH);
        ctx.setLineDash([]);
        ctx.shadowBlur = 0;
        ctx.restore();

        // Fill with opacity based on confidence
        const opacity = confidence / 100 * 0.2;
        ctx.fillStyle = isChecked 
          ? `rgba(0,255,0,${opacity})` 
          : `rgba(255,0,0,${opacity})`;
        ctx.fillRect(roiX, roiY, roiW, roiH);

        // Center dot with confidence ring
        const centerX = roiX + roiW / 2;
        const centerY = roiY + roiH / 2;
        
        ctx.save();
        // Confidence ring
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 12, 0, Math.PI * 2 * (confidence / 100));
        ctx.stroke();
        ctx.globalAlpha = 1;
        
        // Center dot
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();

        // Label with number, status, and confidence
        const label = `#${roi.number} ${isChecked ? '✓' : '✗'} ${fillPercentage.toFixed(1)}% [${Math.round(confidence)}%]`;
        ctx.font = "bold 13px Arial";
        const metrics = ctx.measureText(label);
        const labelWidth = metrics.width + 20;
        const labelHeight = 28;
        const labelX = Math.max(roiX, 5);
        const labelY = Math.max(roiY - labelHeight - 5, 5);
        
        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.85)";
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 10;
        ctx.fillRect(labelX, labelY, labelWidth, labelHeight);
        ctx.shadowBlur = 0;
        ctx.fillStyle = color;
        ctx.fillText(label, labelX + 10, labelY + 19);
        ctx.restore();

        // Dynamic adjustment indicators
        if (isDynamicMode && dynamicResult?.adjustments) {
          const adj = dynamicResult.adjustments;
          if (adj.xOffset || adj.yOffset) {
            ctx.save();
            ctx.strokeStyle = '#ff8800';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
            ctx.globalAlpha = 0.6;
            
            const arrowX = centerX + (adj.xOffset || 0) * canvas.width * 2;
            const arrowY = centerY + (adj.yOffset || 0) * canvas.height * 2;
            
            ctx.beginPath();
            ctx.moveTo(centerX, centerY);
            ctx.lineTo(arrowX, arrowY);
            ctx.stroke();
            
            // Arrowhead
            const angle = Math.atan2(arrowY - centerY, arrowX - centerX);
            const headLen = 8;
            ctx.beginPath();
            ctx.moveTo(arrowX, arrowY);
            ctx.lineTo(arrowX - headLen * Math.cos(angle - 0.5), arrowY - headLen * Math.sin(angle - 0.5));
            ctx.moveTo(arrowX, arrowY);
            ctx.lineTo(arrowX - headLen * Math.cos(angle + 0.5), arrowY - headLen * Math.sin(angle + 0.5));
            ctx.stroke();
            
            ctx.restore();
          }
        }

        // Coordinates and fill percentage
        const infoText = `${(roi.x * 100).toFixed(1)}% ${(roi.y * 100).toFixed(1)}% | ${fillPercentage.toFixed(1)}% filled`;
        ctx.font = "10px Arial";
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        ctx.textAlign = "center";
        ctx.fillText(infoText, centerX, roiY + roiH + 30);
      });

      // Draw dynamic detection grid if in dynamic mode
      if (isDynamicMode && detectionResults.length > 0) {
        ctx.save();
        ctx.globalAlpha = 0.1;
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = 0.5;
        
        // Draw grid showing search area
        detectionResults.forEach((result, index) => {
          const roi = liveROIs.find(r => r.number === result.number);
          if (!roi) return;
          
          const baseX = roi.x * canvas.width;
          const baseY = roi.y * canvas.height;
          const searchSize = 30;
          
          for (let i = -2; i <= 2; i++) {
            for (let j = -2; j <= 2; j++) {
              const x = baseX + i * searchSize;
              const y = baseY + j * searchSize;
              ctx.strokeRect(x, y, 20, 20);
            }
          }
        });
        ctx.restore();
      }
    };

    img.src = warpedImage;
  }, [warpedImage, liveROIs, checkboxes, detectionResults, isDynamicMode]);

  // Handle ROI change with dynamic adjustment
  const handleROIChange = useCallback((index, field, value) => {
    const newROIs = [...liveROIs];
    newROIs[index] = { ...newROIs[index], [field]: parseFloat(value) };
    setLiveROIs(newROIs);
    
    // Track adjustment
    setAdjustmentHistory(prev => [...prev, {
      timestamp: Date.now(),
      index,
      field,
      value: parseFloat(value),
    }].slice(-50));
    
    // Auto-apply changes
    clearTimeout(window._applyTimeout);
    window._applyTimeout = setTimeout(() => {
      if (onUpdateConfig) {
        const config = {
          checkboxes: newROIs.map((roi, i) => ({
            number: roi.number,
            title: checkboxes[i]?.title || `Checkbox ${roi.number}`,
            roi: {
              x: roi.x,
              y: roi.y,
              width: roi.width,
              height: roi.height,
            }
          }))
        };
        onUpdateConfig(config);
      }
      
      // Trigger dynamic adjustment if enabled
      if (isDynamicMode && onDynamicAdjust) {
        onDynamicAdjust({
          type: 'roi_adjustment',
          index,
          roi: newROIs[index],
        });
      }
    }, 500);
  }, [liveROIs, checkboxes, onUpdateConfig, isDynamicMode, onDynamicAdjust]);

  // Handle dynamic adjustment presets
  const handleDynamicAdjust = useCallback((index, direction, amount) => {
    const current = liveROIs[index];
    if (!current) return;
    
    const adjustments = {
      x: { left: -amount, right: amount },
      y: { up: -amount, down: amount },
    };
    
    let newX = current.x;
    let newY = current.y;
    
    if (direction.includes('left')) newX = Math.max(0, current.x - amount);
    if (direction.includes('right')) newX = Math.min(0.5, current.x + amount);
    if (direction.includes('up')) newY = Math.max(0, current.y - amount);
    if (direction.includes('down')) newY = Math.min(1, current.y + amount);
    
    const newROIs = [...liveROIs];
    newROIs[index] = { ...current, x: newX, y: newY };
    setLiveROIs(newROIs);
    
    // Track dynamic adjustment
    setDynamicAdjustments(prev => ({
      ...prev,
      [index]: {
        x: newX,
        y: newY,
        timestamp: Date.now(),
        direction,
      }
    }));
    
    // Apply immediately
    if (onUpdateConfig) {
      const config = {
        checkboxes: newROIs.map((roi, i) => ({
          number: roi.number,
          title: checkboxes[i]?.title || `Checkbox ${roi.number}`,
          roi: {
            x: roi.x,
            y: roi.y,
            width: roi.width,
            height: roi.height,
          }
        }))
      };
      onUpdateConfig(config);
    }
    
    // Trigger dynamic detection re-run
    if (isDynamicMode && onDynamicAdjust) {
      onDynamicAdjust({
        type: 'dynamic_adjust',
        index,
        roi: newROIs[index],
        direction,
      });
    }
  }, [liveROIs, checkboxes, onUpdateConfig, isDynamicMode, onDynamicAdjust]);

  // Reset to original with confirmation
  const handleReset = useCallback(() => {
    if (window.confirm('Reset all ROIs to default positions?')) {
      setLiveROIs(checkboxROIs);
      setDynamicAdjustments({});
      setAdjustmentHistory([]);
      
      if (onUpdateConfig) {
        const config = {
          checkboxes: checkboxROIs.map((roi, i) => ({
            number: roi.number,
            title: checkboxes[i]?.title || `Checkbox ${roi.number}`,
            roi: {
              x: roi.x,
              y: roi.y,
              width: roi.width,
              height: roi.height,
            }
          }))
        };
        onUpdateConfig(config);
      }
    }
  }, [checkboxROIs, checkboxes, onUpdateConfig]);

  // Auto-optimize ROIs based on detection history
  const handleAutoOptimize = useCallback(() => {
    if (detectionResults.length < 3) {
      alert('Need at least 3 detection results to optimize');
      return;
    }
    
    // Calculate optimal positions based on confidence
    const optimized = liveROIs.map((roi, index) => {
      const results = detectionResults.filter(r => r.number === roi.number);
      if (results.length === 0) return roi;
      
      // Find highest confidence detection
      const best = results.reduce((a, b) => 
        (a.confidence || 0) > (b.confidence || 0) ? a : b
      );
      
      if (best.roi) {
        return {
          ...roi,
          x: roi.x * 0.6 + best.roi.x * 0.4,
          y: roi.y * 0.6 + best.roi.y * 0.4,
        };
      }
      return roi;
    });
    
    setLiveROIs(optimized);
    
    // Apply optimized ROIs
    if (onUpdateConfig) {
      const config = {
        checkboxes: optimized.map((roi, i) => ({
          number: roi.number,
          title: checkboxes[i]?.title || `Checkbox ${roi.number}`,
          roi: {
            x: roi.x,
            y: roi.y,
            width: roi.width,
            height: roi.height,
          }
        }))
      };
      onUpdateConfig(config);
    }
  }, [liveROIs, detectionResults, checkboxes, onUpdateConfig]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed bottom-4 left-4 right-4 max-h-[85vh] overflow-y-auto bg-black/95 backdrop-blur-xl rounded-xl border border-green-500/30 shadow-2xl z-50 p-4 text-white font-mono text-xs"
      >
        {/* Header */}
        <div className="flex justify-between items-center sticky top-0 bg-black/95 pb-3 mb-3 border-b border-green-500/20">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isDynamicMode ? 'animate-pulse bg-yellow-400' : 'bg-green-400 animate-pulse'}`} />
              <h3 className={`font-bold text-sm ${isDynamicMode ? 'text-yellow-400' : 'text-green-400'}`}>
                {isDynamicMode ? '🧠 Dynamic Debug' : '🔧 Live Debug'}
              </h3>
            </div>
            <span className="text-gray-500 text-[10px]">
              {checkedCount}/{checkboxes.length} checked
            </span>
            {liveROIs.some((r, i) => 
              r.x !== checkboxROIs[i]?.x || 
              r.y !== checkboxROIs[i]?.y
            ) && (
              <span className="text-yellow-400 text-[10px] bg-yellow-400/20 px-2 py-0.5 rounded animate-pulse">
                ⚡ Modified
              </span>
            )}
            {isDynamicMode && (
              <span className="text-cyan-400 text-[10px] bg-cyan-400/20 px-2 py-0.5 rounded">
                🔄 Auto-adjusting
              </span>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={handleAutoOptimize}
              className="text-cyan-400 hover:text-white transition px-2 text-[10px] bg-cyan-400/20 rounded"
              title="Auto-optimize ROIs based on detection history"
            >
              🎯 Optimize
            </button>
            <button
              onClick={handleReset}
              className="text-yellow-400 hover:text-white transition px-2 text-[10px] bg-yellow-400/20 rounded"
            >
              Reset
            </button>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-gray-400 hover:text-white transition px-2"
            >
              {isExpanded ? "−" : "+"}
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition px-2"
            >
              ✕
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="space-y-3">
            {/* Tabs */}
            <div className="flex gap-2 border-b border-white/10 pb-2">
              <button
                onClick={() => setActiveTab('roi')}
                className={`px-3 py-1 rounded text-[10px] transition ${
                  activeTab === 'roi' 
                    ? 'bg-green-500/20 text-green-400' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                🎛️ ROI Controls
              </button>
              <button
                onClick={() => setActiveTab('dynamic')}
                className={`px-3 py-1 rounded text-[10px] transition ${
                  activeTab === 'dynamic' 
                    ? 'bg-yellow-500/20 text-yellow-400' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                🔄 Dynamic
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-3 py-1 rounded text-[10px] transition ${
                  activeTab === 'history' 
                    ? 'bg-blue-500/20 text-blue-400' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                📊 History
              </button>
            </div>

            {/* Tab Content */}
            {activeTab === 'roi' && (
              <>
                {/* Warped Image with ROIs */}
                {warpedImage && liveROIs.length > 0 && (
                  <div>
                    <div className="text-gray-400 text-[10px] mb-2 flex justify-between">
                      <span>🎯 Warped Card with ROI Overlay</span>
                      <span className="text-yellow-400 text-[9px]">
                        Click values to edit, changes auto-apply
                      </span>
                    </div>
                    <div className="bg-black/50 rounded-lg p-2 border border-white/10 relative">
                      <canvas
                        ref={canvasRef}
                        className="w-full max-h-[300px] object-contain rounded"
                        style={{ maxWidth: '100%' }}
                      />
                      {isDynamicMode && (
                        <div className="absolute top-2 right-2 bg-yellow-400/20 px-2 py-1 rounded text-[8px] text-yellow-400">
                          🧠 Dynamic Mode
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Live ROI Controls */}
                <div>
                  <div className="text-gray-400 text-[10px] mb-2">🎛️ Live ROI Controls</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {liveROIs.map((roi, index) => {
                      const result = checkboxes.find(c => c.number === roi.number);
                      const dynamicResult = detectionResults.find(r => r.number === roi.number);
                      const isChecked = result?.isChecked || false;
                      const confidence = dynamicResult?.confidence || 0;
                      const color = isChecked ? "green" : "red";
                      const dynamicColor = confidence > 70 ? "green" : confidence > 40 ? "yellow" : "red";
                      
                      return (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: index * 0.05 }}
                          className={`p-3 rounded-lg border ${
                            isChecked 
                              ? `bg-${color}-500/10 border-${color}-500/30` 
                              : `bg-${color}-500/10 border-${color}-500/30`
                          }`}
                        >
                          <div className="flex justify-between items-center mb-2">
                            <div className="font-bold text-white text-sm">
                              #{roi.number}
                              <span className={`ml-2 text-[10px] text-${dynamicColor}-400`}>
                                {isChecked ? "✓ CHECKED" : "✗ EMPTY"}
                              </span>
                            </div>
                            <div className="text-[10px] text-gray-400 flex items-center gap-2">
                              <span>{Math.round(result?.fillPercentage || 0)}% fill</span>
                              <span className={`text-${dynamicColor}-400`}>
                                [{Math.round(confidence)}%]
                              </span>
                            </div>
                          </div>

                          {/* Dynamic adjustment controls */}
                          {isDynamicMode && (
                            <div className="flex gap-1 mb-2 bg-yellow-400/5 p-1 rounded">
                              <button
                                onClick={() => handleDynamicAdjust(index, 'left', 0.002)}
                                className="text-[8px] bg-yellow-400/20 text-yellow-400 px-1 py-0.5 rounded hover:bg-yellow-400/30"
                              >
                                ←
                              </button>
                              <button
                                onClick={() => handleDynamicAdjust(index, 'right', 0.002)}
                                className="text-[8px] bg-yellow-400/20 text-yellow-400 px-1 py-0.5 rounded hover:bg-yellow-400/30"
                              >
                                →
                              </button>
                              <button
                                onClick={() => handleDynamicAdjust(index, 'up', 0.002)}
                                className="text-[8px] bg-yellow-400/20 text-yellow-400 px-1 py-0.5 rounded hover:bg-yellow-400/30"
                              >
                                ↑
                              </button>
                              <button
                                onClick={() => handleDynamicAdjust(index, 'down', 0.002)}
                                className="text-[8px] bg-yellow-400/20 text-yellow-400 px-1 py-0.5 rounded hover:bg-yellow-400/30"
                              >
                                ↓
                              </button>
                            </div>
                          )}

                          {/* Slider Controls */}
                          <div className="space-y-2">
                            {/* X Position */}
                            <div>
                              <div className="flex justify-between text-[9px]">
                                <span className="text-gray-400">X: {(roi.x * 100).toFixed(1)}%</span>
                                <span className="text-blue-400">← →</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="0.5"
                                step="0.0005"
                                value={roi.x}
                                onChange={(e) => handleROIChange(index, 'x', e.target.value)}
                                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                style={{
                                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${roi.x * 100}%, #374151 ${roi.x * 100}%, #374151 100%)`
                                }}
                              />
                            </div>

                            {/* Y Position */}
                            <div>
                              <div className="flex justify-between text-[9px]">
                                <span className="text-gray-400">Y: {(roi.y * 100).toFixed(1)}%</span>
                                <span className="text-blue-400">↑ ↓</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.0005"
                                value={roi.y}
                                onChange={(e) => handleROIChange(index, 'y', e.target.value)}
                                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                style={{
                                  background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${roi.y * 100}%, #374151 ${roi.y * 100}%, #374151 100%)`
                                }}
                              />
                            </div>

                            {/* Width */}
                            <div>
                              <div className="flex justify-between text-[9px]">
                                <span className="text-gray-400">Width: {(roi.width * 100).toFixed(1)}%</span>
                                <span className="text-purple-400">↔</span>
                              </div>
                              <input
                                type="range"
                                min="0.02"
                                max="0.15"
                                step="0.0005"
                                value={roi.width}
                                onChange={(e) => handleROIChange(index, 'width', e.target.value)}
                                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                style={{
                                  background: `linear-gradient(to right, #8b5cf6 0%, #8b5cf6 ${roi.width * 100}%, #374151 ${roi.width * 100}%, #374151 100%)`
                                }}
                              />
                            </div>

                            {/* Height */}
                            <div>
                              <div className="flex justify-between text-[9px]">
                                <span className="text-gray-400">Height: {(roi.height * 100).toFixed(1)}%</span>
                                <span className="text-purple-400">↕</span>
                              </div>
                              <input
                                type="range"
                                min="0.02"
                                max="0.1"
                                step="0.0005"
                                value={roi.height}
                                onChange={(e) => handleROIChange(index, 'height', e.target.value)}
                                className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                                style={{
                                  background: `linear-gradient(to right, #8b5cf6 0%, #8b5cf6 ${roi.height * 100}%, #374151 ${roi.height * 100}%, #374151 100%)`
                                }}
                              />
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {activeTab === 'dynamic' && (
              <div className="space-y-3">
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
                  <h4 className="text-yellow-400 text-sm font-bold mb-2">🧠 Dynamic Detection</h4>
                  <p className="text-gray-400 text-[10px] mb-3">
                    The system automatically adjusts ROI positions and thresholds based on detection history.
                  </p>
                  
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-black/50 p-2 rounded text-center">
                      <div className="text-gray-400 text-[8px]">Avg Confidence</div>
                      <div className="text-green-400 font-bold text-sm">{detectionStats.avgConfidence}%</div>
                    </div>
                    <div className="bg-black/50 p-2 rounded text-center">
                      <div className="text-gray-400 text-[8px]">Consistency</div>
                      <div className="text-blue-400 font-bold text-sm">{detectionStats.consistency}%</div>
                    </div>
                    <div className="bg-black/50 p-2 rounded text-center">
                      <div className="text-gray-400 text-[8px]">Adjustments</div>
                      <div className="text-yellow-400 font-bold text-sm">{detectionStats.adjustments}</div>
                    </div>
                  </div>

                  {/* Dynamic adjustment visualization */}
                  {Object.keys(dynamicAdjustments).length > 0 && (
                    <div className="bg-black/50 p-2 rounded max-h-32 overflow-y-auto">
                      <div className="text-gray-400 text-[9px] mb-1">Recent Adjustments:</div>
                      {Object.entries(dynamicAdjustments).slice(-5).map(([key, adj]) => (
                        <div key={key} className="flex justify-between text-[8px] text-gray-300 border-b border-white/5 py-0.5">
                          <span>#{parseInt(key) + 1}</span>
                          <span className="text-yellow-400">
                            {adj.direction} ({(adj.x * 100).toFixed(1)}%, {(adj.y * 100).toFixed(1)}%)
                          </span>
                          <span className="text-gray-500">{new Date(adj.timestamp).toLocaleTimeString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'history' && (
              <div className="space-y-3">
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                  <h4 className="text-blue-400 text-sm font-bold mb-2">📊 Detection History</h4>
                  
                  {adjustmentHistory.length > 0 ? (
                    <div className="max-h-40 overflow-y-auto">
                      <div className="grid grid-cols-4 gap-1 text-[8px] text-gray-400 mb-1">
                        <span>Time</span>
                        <span>#</span>
                        <span>Field</span>
                        <span>Value</span>
                      </div>
                      {adjustmentHistory.slice(-20).map((adj, i) => (
                        <div key={i} className="grid grid-cols-4 gap-1 text-[8px] text-gray-300 border-b border-white/5 py-0.5">
                          <span>{new Date(adj.timestamp).toLocaleTimeString()}</span>
                          <span>#{adj.index + 1}</span>
                          <span>{adj.field}</span>
                          <span className="text-yellow-400">{(adj.value * 100).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-500 text-[10px]">No adjustment history yet</div>
                  )}
                </div>
              </div>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div className="bg-white/5 p-2 rounded">
                <div className="text-gray-400 text-[10px]">Image Size</div>
                <div className="text-white font-mono">
                  {imageSize?.width}×{imageSize?.height}
                </div>
              </div>
              <div className="bg-white/5 p-2 rounded">
                <div className="text-gray-400 text-[10px]">Warped Size</div>
                <div className="text-white font-mono">
                  {warpedSize?.width}×{warpedSize?.height}
                </div>
              </div>
              <div className="bg-white/5 p-2 rounded">
                <div className="text-gray-400 text-[10px]">Global Threshold</div>
                <div className="text-green-400 font-mono">
                  {globalThreshold || "N/A"}
                </div>
              </div>
              <div className="bg-white/5 p-2 rounded">
                <div className="text-gray-400 text-[10px]">Baseline / Margin</div>
                <div className="text-yellow-400 font-mono">
                  {baseline || 0}% / {margin || 0}%
                </div>
              </div>
            </div>

            {/* Detection Results Summary */}
            <div className="bg-white/5 p-3 rounded text-center">
              <p className="text-white text-sm">
                {checkedCount > 0 ? (
                  <span className="text-green-400">
                    ✅ {checkedCount} checkbox{checkedCount > 1 ? "es" : ""} detected
                  </span>
                ) : (
                  <span className="text-red-400">
                    ⚠️ No checkboxes detected
                  </span>
                )}
              </p>
              {checkedCount > 0 && (
                <p className="text-gray-400 text-[10px] mt-1">
                  Checked: {checkboxes
                    .filter((b) => b.isChecked)
                    .map((b) => `#${b.number}`)
                    .join(", ")}
                </p>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default DebugOverlay;
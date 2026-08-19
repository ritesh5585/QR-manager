// DebugOverlay.js - Clean Debug Overlay with Real-time Detection Stats

import React, { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const DebugOverlay = ({ debugInfo, onClose, isDynamicMode = false }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState("detection"); // 'detection' | 'stats' | 'history'
  const canvasRef = useRef(null);
  const [adjustmentHistory, setAdjustmentHistory] = useState([]);
  const [detectionStats, setDetectionStats] = useState({
    avgConfidence: 0,
    consistency: 0,
    totalDetections: 0,
    successRate: 0,
  });

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
    processingTime = 0,
    timestamp = Date.now(),
  } = debugInfo;

  const checkedCount = checkboxes.filter((b) => b.isChecked).length;

  // Update detection stats
  useEffect(() => {
    if (detectionResults.length > 0) {
      const validResults = detectionResults.filter(
        (r) => r.confidence !== undefined,
      );
      if (validResults.length > 0) {
        const avgConf =
          validResults.reduce((sum, r) => sum + (r.confidence || 0), 0) /
          validResults.length;
        const successCount = validResults.filter((r) => r.isChecked).length;
        const successRate = (successCount / validResults.length) * 100;

        setDetectionStats({
          avgConfidence: Math.round(avgConf),
          consistency: Math.round(avgConf * 0.9), // Simplified consistency metric
          totalDetections: validResults.length,
          successRate: Math.round(successRate),
        });
      }
    }
  }, [detectionResults]);

  // Draw warped card with ROIs
  useEffect(() => {
    if (!warpedImage || !checkboxROIs.length || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      // Draw each ROI
      checkboxROIs.forEach((roi, index) => {
        const result = checkboxes.find((c) => c.number === roi.number);
        const dynamicResult = detectionResults.find(
          (r) => r.number === roi.number,
        );

        const roiX = roi.x * canvas.width;
        const roiY = roi.y * canvas.height;
        const roiW = roi.width * canvas.width;
        const roiH = roi.height * canvas.height;

        const isChecked = result?.isChecked || false;
        const confidence = dynamicResult?.confidence || 0;
        const fillPercentage =
          dynamicResult?.fillPercentage || result?.fillPercentage || 0;

        // Color based on confidence and check state
        let color = "#22c55e"; // green
        let borderColor = "rgba(34, 197, 94, 0.3)";

        if (!isChecked) {
          color = "#ef4444"; // red
          borderColor = "rgba(239, 68, 68, 0.3)";
        } else if (confidence < 50) {
          color = "#f59e0b"; // yellow
          borderColor = "rgba(245, 158, 11, 0.3)";
        }

        // Draw ROI rectangle
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = isDynamicMode ? 3 : 2;
        ctx.setLineDash(isDynamicMode ? [8, 4] : [5, 5]);
        ctx.strokeRect(roiX, roiY, roiW, roiH);
        ctx.setLineDash([]);
        ctx.restore();

        // Fill with opacity based on confidence
        const opacity = (confidence / 100) * 0.15;
        ctx.fillStyle = isChecked
          ? `rgba(34, 197, 94, ${opacity})`
          : `rgba(239, 68, 68, ${opacity})`;
        ctx.fillRect(roiX, roiY, roiW, roiH);

        // Center dot
        const centerX = roiX + roiW / 2;
        const centerY = roiY + roiH / 2;

        ctx.save();
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();

        // Label
        const label = `#${roi.number} ${isChecked ? "✓" : "✗"} ${fillPercentage.toFixed(1)}% [${Math.round(confidence)}%]`;
        ctx.font = "bold 12px monospace";
        const metrics = ctx.measureText(label);
        const labelWidth = metrics.width + 16;
        const labelHeight = 24;
        const labelX = Math.max(roiX, 5);
        const labelY = Math.max(roiY - labelHeight - 5, 5);

        ctx.save();
        ctx.fillStyle = "rgba(0,0,0,0.85)";
        ctx.shadowColor = "rgba(0,0,0,0.5)";
        ctx.shadowBlur = 10;
        ctx.fillRect(labelX, labelY, labelWidth, labelHeight);
        ctx.shadowBlur = 0;
        ctx.fillStyle = color;
        ctx.fillText(label, labelX + 8, labelY + 17);
        ctx.restore();

        // Confidence ring
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.arc(
          centerX,
          centerY,
          15,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * (confidence / 100),
        );
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.restore();
      });

      // Draw legend
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(10, 10, 160, 80);
      ctx.fillStyle = "#22c55e";
      ctx.font = "10px monospace";
      ctx.fillText("✅ Checked (High Confidence)", 18, 30);
      ctx.fillStyle = "#f59e0b";
      ctx.fillText("⚠️ Checked (Low Confidence)", 18, 48);
      ctx.fillStyle = "#ef4444";
      ctx.fillText("❌ Empty", 18, 66);
      ctx.restore();

      // Dynamic mode indicator
      if (isDynamicMode) {
        ctx.save();
        ctx.fillStyle = "rgba(245, 158, 11, 0.2)";
        ctx.fillRect(canvas.width - 120, 10, 110, 24);
        ctx.fillStyle = "#f59e0b";
        ctx.font = "10px monospace";
        ctx.fillText("🧠 Dynamic Mode", canvas.width - 110, 27);
        ctx.restore();
      }
    };

    img.src = warpedImage;
  }, [warpedImage, checkboxROIs, checkboxes, detectionResults, isDynamicMode]);

  // Format time
  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  // Get status color
  const getStatusColor = () => {
    if (checkedCount > 0 && detectionStats.avgConfidence > 70)
      return "text-green-400";
    if (checkedCount > 0) return "text-yellow-400";
    return "text-red-400";
  };

  // Get status text
  const getStatusText = () => {
    if (checkedCount > 0 && detectionStats.avgConfidence > 70) {
      return `✅ ${checkedCount} checkbox${checkedCount > 1 ? "es" : ""} detected`;
    }
    if (checkedCount > 0) {
      return `⚠️ ${checkedCount} checkbox${checkedCount > 1 ? "es" : ""} detected (low confidence)`;
    }
    return "❌ No checkboxes detected";
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed bottom-4 left-4 right-4 max-h-[85vh] overflow-y-auto bg-black/95 backdrop-blur-xl rounded-xl border border-gray-700/50 shadow-2xl z-50 p-4 text-white font-mono text-xs"
      >
        {/* Header */}
        <div className="flex justify-between items-center sticky top-0 bg-black/95 pb-3 mb-3 border-b border-gray-700/50">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${isDynamicMode ? "animate-pulse bg-yellow-400" : "bg-green-400"}`}
              />
              <h3
                className={`font-bold text-sm ${isDynamicMode ? "text-yellow-400" : "text-green-400"}`}
              >
                {isDynamicMode ? "🧠 Dynamic Debug" : "🔍 Debug Overlay"}
              </h3>
            </div>
            <span className="text-gray-500 text-[10px]">
              {checkedCount}/{checkboxes.length} checked
            </span>
            {isDynamicMode && (
              <span className="text-cyan-400 text-[10px] bg-cyan-400/20 px-2 py-0.5 rounded">
                🔄 Auto-adjusting
              </span>
            )}
            <span className="text-gray-500 text-[10px]">
              {formatTime(timestamp)}
            </span>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-gray-400 hover:text-white transition px-2 text-sm"
            >
              {isExpanded ? "−" : "+"}
            </button>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition px-2 text-sm"
            >
              ✕
            </button>
          </div>
        </div>

        {isExpanded && (
          <div className="space-y-3">
            {/* Tabs */}
            <div className="flex gap-2 border-b border-gray-700/50 pb-2">
              <button
                onClick={() => setActiveTab("detection")}
                className={`px-3 py-1 rounded text-[10px] transition ${
                  activeTab === "detection"
                    ? "bg-green-500/20 text-green-400"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                🎯 Detection
              </button>
              <button
                onClick={() => setActiveTab("stats")}
                className={`px-3 py-1 rounded text-[10px] transition ${
                  activeTab === "stats"
                    ? "bg-blue-500/20 text-blue-400"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                📊 Stats
              </button>
              <button
                onClick={() => setActiveTab("history")}
                className={`px-3 py-1 rounded text-[10px] transition ${
                  activeTab === "history"
                    ? "bg-purple-500/20 text-purple-400"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                📋 History
              </button>
            </div>

            {/* Tab Content */}
            {activeTab === "detection" && (
              <>
                {/* Warped Image with ROIs */}
                {warpedImage && checkboxROIs.length > 0 && (
                  <div>
                    <div className="text-gray-400 text-[10px] mb-2 flex justify-between">
                      <span>🎯 Warped Card with ROI Overlay</span>
                      <span className="text-gray-500 text-[9px]">
                        Processing: {processingTime}ms
                      </span>
                    </div>
                    <div className="bg-black/50 rounded-lg p-2 border border-gray-700/50 relative">
                      <canvas
                        ref={canvasRef}
                        className="w-full max-h-[300px] object-contain rounded"
                        style={{ maxWidth: "100%" }}
                      />
                    </div>
                  </div>
                )}

                {/* Detection Results Summary */}
                <div
                  className={`p-3 rounded-lg border ${checkedCount > 0 ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5"}`}
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className={`text-sm font-bold ${getStatusColor()}`}>
                        {getStatusText()}
                      </p>
                      {checkedCount > 0 && (
                        <p className="text-gray-400 text-[10px] mt-1">
                          Checked:{" "}
                          {checkboxes
                            .filter((b) => b.isChecked)
                            .map((b) => `#${b.number}`)
                            .join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-gray-400 text-[9px]">
                        Avg Confidence
                      </div>
                      <div
                        className={`text-lg font-bold ${detectionStats.avgConfidence > 70 ? "text-green-400" : "text-yellow-400"}`}
                      >
                        {detectionStats.avgConfidence}%
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="bg-white/5 p-2 rounded">
                    <div className="text-gray-400 text-[8px]">Image Size</div>
                    <div className="text-white font-mono text-[11px]">
                      {imageSize?.width}×{imageSize?.height}
                    </div>
                  </div>
                  <div className="bg-white/5 p-2 rounded">
                    <div className="text-gray-400 text-[8px]">Warped Size</div>
                    <div className="text-white font-mono text-[11px]">
                      {warpedSize?.width}×{warpedSize?.height}
                    </div>
                  </div>
                  <div className="bg-white/5 p-2 rounded">
                    <div className="text-gray-400 text-[8px]">Threshold</div>
                    <div className="text-green-400 font-mono text-[11px]">
                      {globalThreshold || "N/A"}
                    </div>
                  </div>
                  <div className="bg-white/5 p-2 rounded">
                    <div className="text-gray-400 text-[8px]">Baseline</div>
                    <div className="text-yellow-400 font-mono text-[11px]">
                      {baseline || 0}%
                    </div>
                  </div>
                </div>
              </>
            )}

            {activeTab === "stats" && (
              <div className="space-y-3">
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                  <h4 className="text-blue-400 text-sm font-bold mb-3">
                    📊 Detection Statistics
                  </h4>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-black/50 p-3 rounded text-center">
                      <div className="text-gray-400 text-[8px] uppercase tracking-wider">
                        Avg Confidence
                      </div>
                      <div
                        className={`text-2xl font-bold ${detectionStats.avgConfidence > 70 ? "text-green-400" : "text-yellow-400"}`}
                      >
                        {detectionStats.avgConfidence}%
                      </div>
                      <div className="text-gray-500 text-[8px] mt-1">
                        {detectionStats.avgConfidence > 70
                          ? "✅ High"
                          : detectionStats.avgConfidence > 40
                            ? "⚠️ Medium"
                            : "❌ Low"}
                      </div>
                    </div>

                    <div className="bg-black/50 p-3 rounded text-center">
                      <div className="text-gray-400 text-[8px] uppercase tracking-wider">
                        Success Rate
                      </div>
                      <div
                        className={`text-2xl font-bold ${detectionStats.successRate > 70 ? "text-green-400" : "text-yellow-400"}`}
                      >
                        {detectionStats.successRate}%
                      </div>
                      <div className="text-gray-500 text-[8px] mt-1">
                        {detectionStats.totalDetections} detections
                      </div>
                    </div>

                    <div className="bg-black/50 p-3 rounded text-center">
                      <div className="text-gray-400 text-[8px] uppercase tracking-wider">
                        Checked Boxes
                      </div>
                      <div className="text-2xl font-bold text-white">
                        {checkedCount}/{checkboxes.length}
                      </div>
                      <div className="text-gray-500 text-[8px] mt-1">
                        {Math.round((checkedCount / checkboxes.length) * 100)}%
                        filled
                      </div>
                    </div>

                    <div className="bg-black/50 p-3 rounded text-center">
                      <div className="text-gray-400 text-[8px] uppercase tracking-wider">
                        Consistency
                      </div>
                      <div
                        className={`text-2xl font-bold ${detectionStats.consistency > 70 ? "text-green-400" : "text-yellow-400"}`}
                      >
                        {detectionStats.consistency}%
                      </div>
                      <div className="text-gray-500 text-[8px] mt-1">
                        {isDynamicMode ? "🔄 Dynamic" : "📌 Static"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Individual Checkbox Stats */}
                <div className="bg-white/5 p-3 rounded-lg">
                  <h5 className="text-gray-400 text-[9px] uppercase tracking-wider mb-2">
                    Individual Results
                  </h5>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
                    {checkboxes.map((cb) => {
                      const result = detectionResults.find(
                        (r) => r.number === cb.number,
                      );
                      const confidence = result?.confidence || 0;
                      const fill =
                        result?.fillPercentage || cb.fillPercentage || 0;

                      return (
                        <div
                          key={cb.number}
                          className="flex justify-between items-center bg-black/30 px-2 py-1 rounded"
                        >
                          <span className="text-gray-300 text-[9px]">
                            #{cb.number}
                          </span>
                          <span
                            className={`text-[9px] ${cb.isChecked ? "text-green-400" : "text-red-400"}`}
                          >
                            {cb.isChecked ? "✓" : "✗"} {confidence}%
                          </span>
                          <span className="text-gray-500 text-[8px]">
                            {fill.toFixed(1)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "history" && (
              <div className="space-y-3">
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
                  <h4 className="text-purple-400 text-sm font-bold mb-2">
                    📋 Detection History
                  </h4>

                  {adjustmentHistory.length > 0 ? (
                    <div className="max-h-40 overflow-y-auto">
                      <div className="grid grid-cols-4 gap-1 text-[8px] text-gray-400 mb-1 border-b border-gray-700/50 pb-1">
                        <span>Time</span>
                        <span>Box</span>
                        <span>Confidence</span>
                        <span>Status</span>
                      </div>
                      {adjustmentHistory.slice(-20).map((adj, i) => (
                        <div
                          key={i}
                          className="grid grid-cols-4 gap-1 text-[8px] text-gray-300 border-b border-white/5 py-0.5"
                        >
                          <span>{formatTime(adj.timestamp)}</span>
                          <span>#{adj.index + 1}</span>
                          <span
                            className={
                              adj.confidence > 70
                                ? "text-green-400"
                                : "text-yellow-400"
                            }
                          >
                            {adj.confidence}%
                          </span>
                          <span
                            className={
                              adj.isChecked ? "text-green-400" : "text-red-400"
                            }
                          >
                            {adj.isChecked ? "✓" : "✗"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-500 text-[10px] text-center py-4">
                      No detection history yet
                    </div>
                  )}
                </div>

                {/* System Info */}
                <div className="bg-white/5 p-2 rounded text-[9px] text-gray-500">
                  <div className="flex justify-between">
                    <span>
                      Engine:{" "}
                      {debugInfo.engineVersion || "checkboxDetector-v3-diff"}
                    </span>
                    <span>Mode: {isDynamicMode ? "Dynamic" : "Static"}</span>
                    <span>ROIs: {checkboxROIs.length}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default DebugOverlay;

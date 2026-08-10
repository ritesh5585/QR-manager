import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

const DebugOverlay = ({ debugInfo, onClose }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!debugInfo) return null;

  const {
    checkboxes,
    warpedImage,
    roiThreshold,
    imageSize,
    warpedSize,
    globalThreshold,
    baseline,
    margin,
  } = debugInfo;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed bottom-4 left-4 right-4 max-h-[60vh] overflow-y-auto bg-black/95 backdrop-blur-xl rounded-xl border border-green-500/30 shadow-2xl z-50 p-4 text-white font-mono text-xs"
      >
        {/* Header */}
        <div className="flex justify-between items-center sticky top-0 bg-black/95 pb-3 mb-3 border-b border-green-500/20">
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <h3 className="text-green-400 font-bold text-sm">
              🔍 Detection Debug
            </h3>
          </div>
          <div className="flex gap-2">
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
                <div className="text-gray-400 text-[10px]">
                  Global Threshold
                </div>
                <div className="text-green-400 font-mono">
                  {globalThreshold || "N/A"}
                </div>
              </div>
              <div className="bg-white/5 p-2 rounded">
                <div className="text-gray-400 text-[10px]">
                  Baseline / Margin
                </div>
                <div className="text-yellow-400 font-mono">
                  {baseline || 0}% / {margin || 0}%
                </div>
              </div>
            </div>

            {/* Checkbox Results */}
            <div>
              <div className="text-gray-400 text-[10px] mb-2">
                Checkbox Analysis
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {checkboxes?.map((box, index) => (
                  <motion.div
                    key={index}
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: index * 0.1 }}
                    className={`p-3 rounded-lg border ${
                      box.isChecked
                        ? "bg-green-500/10 border-green-500/30"
                        : "bg-red-500/10 border-red-500/30"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-white text-sm">
                          #{box.number}
                        </div>
                        <div className="text-gray-400 text-[10px] truncate max-w-[120px]">
                          {box.displayName || box.title}
                        </div>
                      </div>
                      <div
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          box.isChecked
                            ? "bg-green-500/20 text-green-400"
                            : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {box.isChecked ? "✓ CHECKED" : "✗ EMPTY"}
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1 text-[10px]">
                      <div>
                        <span className="text-gray-400">Fill:</span>
                        <span className="text-white ml-1 font-bold">
                          {box.fillPercentage || box.inkPercentage || 0}%
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400">Confidence:</span>
                        <span
                          className={`ml-1 font-bold ${
                            (box.confidence || 0) >= 80
                              ? "text-green-400"
                              : (box.confidence || 0) >= 50
                                ? "text-yellow-400"
                                : "text-red-400"
                          }`}
                        >
                          {box.confidence || 0}%
                        </span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-gray-400">
                          Diff from baseline:
                        </span>
                        <span className="text-white ml-1">
                          {box.diffFromBaseline || 0}%
                        </span>
                      </div>
                    </div>
                    {/* Progress bar for fill percentage */}
                    <div className="mt-2 h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{
                          width: `${Math.min(box.fillPercentage || box.inkPercentage || 0, 100)}%`,
                        }}
                        transition={{ duration: 0.5 }}
                        className={`h-full rounded-full ${
                          box.isChecked ? "bg-green-400" : "bg-red-400"
                        }`}
                      />
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Images */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {warpedImage && (
                <div>
                  <div className="text-gray-400 text-[10px] mb-1">
                    Warped Image with ROI
                  </div>
                  <img
                    src={warpedImage}
                    alt="Warped"
                    className="max-h-[200px] w-full object-contain rounded border border-white/10"
                  />
                </div>
              )}
              {roiThreshold && (
                <div>
                  <div className="text-gray-400 text-[10px] mb-1">
                    ROI Threshold
                  </div>
                  <img
                    src={roiThreshold}
                    alt="ROI Threshold"
                    className="max-h-[200px] w-full object-contain rounded border border-white/10"
                  />
                </div>
              )}
            </div>

            {/* Summary */}
            <div className="bg-white/5 p-2 rounded text-center">
              <span className="text-gray-400 text-[10px]">
                {checkboxes?.filter((b) => b.isChecked).length || 0} of{" "}
                {checkboxes?.length || 0} checkboxes detected
              </span>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};

export default DebugOverlay;

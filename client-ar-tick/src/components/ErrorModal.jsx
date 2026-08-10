// src/components/ErrorModal.jsx
// Enhanced Error Modal with debug info

import React from "react";
import { motion, AnimatePresence } from "framer-motion";

const ErrorModal = ({
  isOpen,
  title = "Scan Failed",
  message = "Something went wrong. Please try again.",
  details = null,
  onRetry,
  onCancel,
  onClose,
  showDebug = false,
  debugInfo = null,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="bg-white rounded-2xl p-8 max-w-2xl w-full mx-4 text-center shadow-2xl max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Icon */}
          <div className="text-7xl mb-4">
            {title.includes("No Checkboxes")
              ? "📋"
              : title.includes("Network")
                ? "🌐"
                : title.includes("Camera")
                  ? "📷"
                  : title.includes("Processing")
                    ? "⚙️"
                    : "⚠️"}
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold text-gray-800 mb-2">{title}</h2>

          {/* Message */}
          <p className="text-gray-600 mb-4">{message}</p>

          {/* Details */}
          {details && (
            <div className="bg-gray-50 rounded-lg p-4 mb-4 text-left">
              <p className="text-sm text-gray-500 font-mono whitespace-pre-wrap">
                {details}
              </p>
            </div>
          )}

          {/* Debug Info */}
          {showDebug && debugInfo && (
            <div className="bg-black/90 rounded-lg p-4 mb-4 text-left overflow-auto max-h-[200px]">
              <p className="text-green-400 text-xs font-mono mb-2">
                🔍 Debug Info:
              </p>
              <pre className="text-gray-300 text-[10px] font-mono whitespace-pre-wrap">
                {JSON.stringify(debugInfo, null, 2)}
              </pre>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-4">
            {onRetry && (
              <button
                onClick={onRetry}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-medium"
              >
                Try Again
              </button>
            )}
            <button
              onClick={onCancel || onClose}
              className="px-6 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition font-medium"
            >
              Cancel
            </button>
          </div>

          {/* Help text */}
          {title.includes("No Checkboxes") && (
            <div className="mt-4 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-xs text-yellow-700">
                💡 Tips: Make sure the card is well-lit, properly aligned, and
                the checkboxes are clearly visible.
              </p>
            </div>
          )}

          {title.includes("Network") && (
            <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-200">
              <p className="text-xs text-red-700">
                🔌 Check your internet connection and make sure the server is
                running.
              </p>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ErrorModal;

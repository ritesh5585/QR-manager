import React from "react";

const ErrorModal = ({ isOpen, title, message, onRetry, onCancel }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
      <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 text-center shadow-2xl">
        <div className="text-6xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold text-red-600 mb-2">
          {title || "Scan Failed"}
        </h2>
        <p className="text-gray-600 mb-6">
          {message || "Something went wrong. Please try again."}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={onRetry}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            Try Again
          </button>
          <button
            onClick={onCancel}
            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default ErrorModal;

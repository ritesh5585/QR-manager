import React from 'react';

const ErrorModal = ({ 
  isOpen = false, 
  title = "Scan Failed", 
  message = "Something went wrong. Please try again.", 
  onRetry, 
  onCancel,
  onClose 
}) => {
  if (!isOpen) return null;

  const handleRetry = () => {
    if (onRetry) onRetry();
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
  };

  const handleClose = () => {
    if (onClose) onClose();
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50" onClick={handleClose}>
      <div className="bg-white/70 backdrop-blur rounded-lg p-8 max-w-md w-full mx-4 text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="text-6xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold text-red-600 mb-2">
          {title}
        </h2>
        <p className="text-gray-600 mb-6">
          {message}
        </p>
        <div className="flex gap-3 justify-center">
          {onRetry && (
            <button
              onClick={handleRetry}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Try Again
            </button>
          )}
          <button
            onClick={handleCancel}
            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
          >
            {onRetry ? 'Cancel' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ErrorModal;
// src/pages/DocumentScanner.jsx
// Full error handling with debug support

import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import CardScanner from "../components/CardScanner";
import ErrorModal from "../components/ErrorModal";
import { assignQR } from "../service/api.service";

const DocumentScanner = () => {
  const { qrId } = useParams();
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorModal, setErrorModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    details: null,
    debugInfo: null,
    showDebug: false,
  });
  const [lastDebugInfo, setLastDebugInfo] = useState(null);

  const handleCardScanned = async (
    checkedBoxes,
    warpedImage,
    debugInfo = null,
  ) => {
    setIsProcessing(true);

    console.log("📊 Debug Info:", debugInfo);

    // Store debug info for error modal
    if (debugInfo) {
      setLastDebugInfo(debugInfo);
    }

    try {
      if (!checkedBoxes || checkedBoxes.length === 0) {
        console.warn("⚠️ No checkboxes detected");
        setErrorModal({
          isOpen: true,
          title: "No Checkboxes Detected",
          message:
            "No checkboxes were found on the card. Please make sure the card is properly aligned and well-lit.",
          details:
            "The system scanned the card but couldn't find any checked checkboxes. This could be due to:\n• Poor lighting conditions\n• Card not properly aligned\n• Checkboxes not clearly marked\n• Card design mismatch",
          debugInfo: debugInfo || lastDebugInfo,
          showDebug: true,
        });
        setIsProcessing(false);
        return;
      }

      // ✅ Check 2: No QR ID provided
      if (!qrId) {
        console.error("❌ No QR ID provided");
        setErrorModal({
          isOpen: true,
          title: "Invalid QR Code",
          message: "The QR code ID is missing. Please try scanning again.",
          details:
            "QR ID is required to save the results. Please make sure you're using a valid QR code.",
          debugInfo: debugInfo || lastDebugInfo,
          showDebug: true,
        });
        setIsProcessing(false);
        return;
      }

      // ✅ Check 3: Prepare payload
      const OPTION_FILE_TYPES = {
        1: "mp4",  // I Eat While Distracted
        2: "mp4",  // I Eat In A Hurry
        3: "jpg",  // I Eat Mindfully
      };

      const payload = checkedBoxes.map((box) => ({
        number: box.number,
        title: box.title,
        fileType: OPTION_FILE_TYPES[box.number] || "mp4",
        fillPercentage: box.fillPercentage || 0,
        confidence: box.confidence || 0,
      }));

      console.log("📤 Sending payload:", JSON.stringify(payload, null, 2));

      // ✅ Check 4: API Call with error handling
      let result;
      try {
        result = await assignQR(qrId, payload);
        console.log("✅ API Response:", result);
      } catch (apiError) {
        console.error("❌ API Error:", apiError);

        // Check if it's a network error
        if (
          apiError.message?.includes("Failed to fetch") ||
          apiError.message?.includes("Network")
        ) {
          setErrorModal({
            isOpen: true,
            title: "Network Error",
            message:
              "Could not connect to the server. Please check your internet connection.",
            details: `Error: ${apiError.message}\n\nMake sure:\n• Your internet connection is active\n• The server is running\n• The API URL is correct: ${import.meta.env.VITE_API_URL}`,
            debugInfo: debugInfo || lastDebugInfo,
            showDebug: true,
          });
        } else if (apiError.message?.includes("CORS")) {
          setErrorModal({
            isOpen: true,
            title: "CORS Error",
            message:
              "Cross-origin request blocked. Please check server configuration.",
            details: `Error: ${apiError.message}\n\nThis usually happens when:\n• The server is not configured for CORS\n• The frontend and backend are on different domains\n• The ngrok tunnel is misconfigured`,
            debugInfo: debugInfo || lastDebugInfo,
            showDebug: true,
          });
        } else {
          setErrorModal({
            isOpen: true,
            title: "Server Error",
            message:
              "The server encountered an error while saving your results.",
            details: `Error: ${apiError.message || "Unknown error"}`,
            debugInfo: debugInfo || lastDebugInfo,
            showDebug: true,
          });
        }

        setIsProcessing(false);
        toast.error("Failed to save results");
        return;
      }

      // ✅ Success - navigate to result page
      // toast.success(`✅ Found ${checkedBoxes.length} option(s)!`);
      // navigate(`/result/${qrId}`);
      // ✅ Success - stay on scanner page
toast.success(`✅ Found ${checkedBoxes.length} option(s)!`);
    } catch (error) {
      console.error("❌ Unexpected error:", error);

      // ✅ Catch any unexpected errors
      setErrorModal({
        isOpen: true,
        title: "Unexpected Error",
        message:
          "Something went wrong while processing your card. Please try again.",
        details: `Error: ${error.message || "Unknown error"}\n\nStack: ${error.stack || "N/A"}`,
        debugInfo: debugInfo || lastDebugInfo,
        showDebug: true,
      });
      toast.error("Processing failed");
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle error modal actions
  const handleErrorRetry = () => {
    setErrorModal({
      isOpen: false,
      title: "",
      message: "",
      details: null,
      debugInfo: null,
      showDebug: false,
    });
    // Reload the page to start fresh
    window.location.reload();
  };

  const handleErrorCancel = () => {
    setErrorModal({
      isOpen: false,
      title: "",
      message: "",
      details: null,
      debugInfo: null,
      showDebug: false,
    });
    navigate(-1);
  };

  const handleErrorClose = () => {
    setErrorModal({
      isOpen: false,
      title: "",
      message: "",
      details: null,
      debugInfo: null,
      showDebug: false,
    });
  };

  // Handle debug info from scanner
  const handleDebugInfo = (debugInfo) => {
    setLastDebugInfo(debugInfo);
  };

  return (
    <div className="min-h-screen bg-[#f3e8d4]">
      <CardScanner
        onCardScanned={handleCardScanned}
        onDebugInfo={handleDebugInfo}
        qrId={qrId}
        showDebug={true}
      />

      {/* Error Modal */}
      <ErrorModal
        isOpen={errorModal.isOpen}
        title={errorModal.title}
        message={errorModal.message}
        details={errorModal.details}
        debugInfo={errorModal.debugInfo}
        showDebug={errorModal.showDebug}
        onRetry={handleErrorRetry}
        onCancel={handleErrorCancel}
        onClose={handleErrorClose}
      />

      {/* Processing Overlay */}
      {isProcessing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40">
          <div className="bg-white rounded-2xl p-6 flex flex-col items-center shadow-xl max-w-sm w-full mx-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mb-4" />
            <p className="text-gray-700 font-medium text-center">
              Saving your results...
            </p>
            <p className="text-gray-400 text-sm mt-1 text-center">
              Please wait
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentScanner;

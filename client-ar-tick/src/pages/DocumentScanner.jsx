// src/pages/DocumentScanner.jsx

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
  });

  const handleCardScanned = async (checkedBoxes, warpedImage) => {
    setIsProcessing(true);

    console.log("📊 Card scanned:", checkedBoxes);
    console.log("📊 QR ID:", qrId);

    try {
      // Check if any boxes were detected
      if (!checkedBoxes || checkedBoxes.length === 0) {
        console.warn("⚠️ No checkboxes detected");
        setErrorModal({
          isOpen: true,
          title: "No Checkboxes Detected",
          message:
            "No checkboxes were found on the card. Please make sure the card is properly aligned and well-lit.",
        });
        setIsProcessing(false);
        return;
      }

      // Check if qrId exists
      if (!qrId) {
        console.error("❌ No QR ID provided");
        setErrorModal({
          isOpen: true,
          title: "Invalid QR Code",
          message: "The QR code ID is missing. Please try scanning again.",
        });
        setIsProcessing(false);
        return;
      }

      // Prepare payload
      const payload = checkedBoxes.map((box) => ({
        number: box.number,
        title: box.title,
        fileType: box.fileType,
        fillPercentage: box.fillPercentage || 0,
      }));

      console.log("📤 Sending payload:", JSON.stringify(payload, null, 2));

      // Call API
      const result = await assignQR(qrId, payload);
      console.log("✅ API Response:", result);

      // Success - navigate to result page
      toast.success(`✅ Found ${checkedBoxes.length} option(s)!`);
      navigate(`/result/${qrId}`);
    } catch (error) {
      console.error("Error saving results:", error);

      // Check error type
      let message = "Failed to save results. Please try again.";
      if (
        error.message?.includes("Failed to fetch") ||
        error.message?.includes("Network")
      ) {
        message = "Network error. Please check your internet connection.";
      } else if (error.message?.includes("CORS")) {
        message = "CORS error. Please check the server configuration.";
      } else if (error.message) {
        message = error.message;
      }

      setErrorModal({
        isOpen: true,
        title: "Save Failed",
        message: message,
      });
      toast.error("Failed to save results");
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle error modal actions
  const handleErrorRetry = () => {
    setErrorModal({ isOpen: false, title: "", message: "" });
    window.location.reload();
  };

  const handleErrorCancel = () => {
    setErrorModal({ isOpen: false, title: "", message: "" });
    navigate(-1);
  };

  return (
    <div className="min-h-screen bg-[#f3e8d4]">
      <CardScanner onCardScanned={handleCardScanned} qrId={qrId} />

      {/* Error Modal */}
      <ErrorModal
        isOpen={errorModal.isOpen}
        title={errorModal.title}
        message={errorModal.message}
        onRetry={handleErrorRetry}
        onCancel={handleErrorCancel}
      />

      {/* Processing Overlay */}
      {isProcessing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40">
          <div className="bg-white rounded-lg p-6 flex flex-col items-center shadow-xl">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4" />
            <p className="text-gray-700 font-medium">Saving your results...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentScanner;

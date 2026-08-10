import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import CardScanner from "../components/CardScanner";
import { assignQR } from "../service/api.service";

const DocumentScanner = () => {
  const { qrId } = useParams();
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [showErrorModal, setShowErrorModal] = useState(false);

  const handleCardScanned = async (checkedBoxes, warpedImage) => {
    setIsProcessing(true);
    setScanError(null);

    console.log("📊 Card scanned:", checkedBoxes);
    console.log("📊 QR ID:", qrId);

    try {
      // ✅ Check if any boxes were detected
      if (!checkedBoxes || checkedBoxes.length === 0) {
        console.warn("⚠️ No checkboxes detected");
        setScanError("No checkboxes detected on the card. Please try again.");
        setShowErrorModal(true);
        setIsProcessing(false);
        return;
      }

      // ✅ Check if qrId exists
      if (!qrId) {
        console.error("❌ No QR ID provided");
        setScanError("Invalid QR code. Please try again.");
        setShowErrorModal(true);
        setIsProcessing(false);
        return;
      }

      // ✅ Prepare payload
      const payload = checkedBoxes.map((box) => ({
        number: box.number,
        title: box.title,
        fileType: box.fileType,
        fillPercentage: box.fillPercentage || 0,
      }));

      console.log("📤 Sending payload:", JSON.stringify(payload, null, 2));

      // ✅ Call API
      const result = await assignQR(qrId, payload);
      console.log("✅ API Response:", result);

      // ✅ Success - navigate to result page
      toast.success(`✅ Found ${checkedBoxes.length} option(s)!`);
      navigate(`/result/${qrId}`);
    } catch (error) {
      console.error("❌ Error saving results:", error);

      // ✅ Check if it's a network error
      if (
        error.message?.includes("Failed to fetch") ||
        error.message?.includes("Network")
      ) {
        setScanError("Network error. Please check your connection.");
      } else {
        setScanError(
          error.message || "Failed to save results. Please try again.",
        );
      }

      setShowErrorModal(true);
      toast.error("Failed to save results");
    } finally {
      setIsProcessing(false);
    }
  };

  // ✅ Error Modal Component
  const ErrorModal = () => {
    if (!showErrorModal) return null;

    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 text-center shadow-2xl">
          <div className="text-6xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-red-600 mb-2">Scan Failed</h2>
          <p className="text-gray-600 mb-6">
            {scanError || "Something went wrong. Please try again."}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => {
                setShowErrorModal(false);
                setScanError(null);
                window.location.reload();
              }}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Try Again
            </button>
            <button
              onClick={() => navigate(-1)}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f3e8d4]">
      <CardScanner onCardScanned={handleCardScanned} qrId={qrId} />

      {/* ✅ Error Modal */}
      <ErrorModal />

      {/* ✅ Processing Overlay */}
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

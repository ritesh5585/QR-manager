// src/pages/DocumentScanner.jsx

import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import CardScanner from "../components/CardScanner";
import { toast } from "react-hot-toast";
import { assignQR } from "../service/api.service";

const DocumentScanner = () => {
  const { qrId } = useParams();
  const navigate = useNavigate();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleCardScanned = async (checkedBoxes, warpedImage) => {
    setIsProcessing(true);
    console.log("📊 Card scanned:", checkedBoxes);

    try {
      if (qrId && checkedBoxes.length > 0) {
        const payload = checkedBoxes.map((box) => ({
          number: box.number,
          title: box.title,
          fileType: box.fileType,
          fillPercentage: box.fillPercentage,
        }));

        await assignQR(qrId, payload);

        toast.success(`✅ Found ${checkedBoxes.length} option(s)`);
        navigate(`/result/${qrId}`);
      } else {
        toast.error("No options selected");
        // Show modal or go back
        navigate(-1);
      }
    } catch (error) {
      console.error("❌ Error saving results:", error);
      toast.error("Failed to save results: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f3e8d4]">
      <CardScanner onCardScanned={handleCardScanned} qrId={qrId} />
    </div>
  );
};

export default DocumentScanner;

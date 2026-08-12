import { useState, useEffect } from "react";
import { qrDetails as qrDetail } from "../service/api.service";
import { useParams } from "react-router-dom";
import { FiDownload } from "react-icons/fi";
import { FaSquareCheck } from "react-icons/fa6";

const OPTION_MAPPING = {
  1: {
    title: "i_eat_while_distracted",
    fileType: "mp4",
    label: "I Eat While Distracted",
  },
  2: {
    title: "i_eat_in_a_hurry",
    fileType: "mp4",
    label: "I Eat In A Hurry",
  },
  3: {
    title: "i_eat_mindfully",
    fileType: "jpg",
    label: "I Eat Mindfully",
  },
};

const Result = () => {
  const { qrId } = useParams();
  const [qrDetails, setQrDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchQRDetails = async () => {
      try {
        console.log("📡 Fetching QR details for:", qrId);
        const data = await qrDetail(qrId);
        console.log("📊 QR Details:", data);
        setQrDetails(data);
        setLoading(false);
      } catch (err) {
        console.error("❌ Error fetching details:", err);
        setError(err.message);
        setLoading(false);
      }
    };

    if (qrId) {
      fetchQRDetails();
    }
  }, [qrId]);

  if (loading) {
    return (
      <div className="text-center py-16 text-lg font-medium text-gray-600">
        Loading details...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-16 text-red-600 font-semibold">
        Error: {error}
      </div>
    );
  }

  const assignedDetails = Array.isArray(qrDetails?.assignedDetails)
    ? qrDetails.assignedDetails
    : [];
  
  // Validate and filter out any items without a valid number
  const validDetails = assignedDetails.filter(
    (detail) => detail && typeof detail.number === "number" && detail.number > 0
  );

  // Debug logging if there are invalid details
  if (assignedDetails.length > validDetails.length) {
    const invalidDetails = assignedDetails.filter(
      (detail) => !detail || typeof detail.number !== "number" || detail.number <= 0
    );
    console.warn(
      `⚠️ Found ${invalidDetails.length} invalid detail(s):`,
      invalidDetails
    );
  }

  const sortedDetails = [...validDetails].sort(
    (a, b) => (a.number || 0) - (b.number || 0),
  );

  return (
    <div className="min-h-[100dvh] bg-[#f3e8d4] py-10 px-4">
      <div className="max-w-3xl mx-auto text-center space-y-6">
        {sortedDetails.length > 0 ? (
          <>
            <img
              src="/main-icon.svg"
              alt="Result"
              className="mx-auto w-[350px] h-auto"
            />

            <h2 className="font-semibold text-[#046a81] flex items-center justify-center gap-2">
              <FaSquareCheck className="text-green-600" />
              You have chosen
            </h2>

            <ul className="grid gap-4 md:grid-cols-2 px-2 md:px-6">
              {sortedDetails.map((detail, index) => {
                const option = OPTION_MAPPING[detail.number];
                if (!option) {
                  console.warn("Unknown option number:", detail.number);
                  return null;
                }

                return (
                  <li
                    key={index}
                    className={`flex ${
                      index % 2 === 0 ? "flex-row" : "flex-row-reverse"
                    } rounded-lg items-center justify-between px-4 space-y-3 hover:shadow-lg transition`}
                  >
                    <img
                      src={`/${option.title}.svg`}
                      alt={option.label}
                      className="w-[40vw] h-auto object-contain"
                      onError={(e) => {
                        console.error(`Failed to load: /${option.title}.svg`);
                        e.target.src = '/placeholder.svg';
                      }}
                    />
                    <div className="flex flex-col justify-center items-center gap-2">
                      <img
                        src={`/${option.title}-text.svg`}
                        alt="text"
                        className="w-23"
                        onError={(e) => {
                          console.error(`Failed to load: /${option.title}-text.svg`);
                          e.target.style.display = 'none';
                        }}
                      />
                      <button
                        onClick={() => {
                          const fileName = `${option.title}.${option.fileType}`;
                          const link = document.createElement("a");
                          link.href = `/${fileName}`;
                          link.download = fileName;
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-teal-500 hover:bg-teal-600 text-white rounded-md text-sm"
                      >
                        <FiDownload size={16} />
                        <p className="text-xs">Download</p>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <div className="text-center">
            <div className="text-6xl mb-4">📋</div>
            <p className="text-gray-600 text-lg">
              No options were selected on this QR code.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Scan Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Result;
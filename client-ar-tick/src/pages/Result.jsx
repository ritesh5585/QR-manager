import { useState, useEffect } from "react";
import axios from "axios";
import { useParams } from "react-router-dom";
import { FiDownload } from "react-icons/fi";
import { FaSquareCheck } from "react-icons/fa6";

const Result = () => {
  const { qrId } = useParams();
  const [qrDetails, setQrDetails] = useState();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    
// axios calling ============================================
    const fetchQRDetails = async () => {
      try {
        const response = await axios.get(
          `${import.meta.env.VITE_API_URL}/qr/details/${qrId}`,
        );
        setQrDetails(response.data);
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    };
// =============================================================

    fetchQRDetails();
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

  return (
    <div className="min-h-[100dvh] bg-[#f3e8d4] py-10 px-4">
      <div className="max-w-3xl mx-auto text-center space-y-6">
        {qrDetails?.status === "assigned" &&
        qrDetails?.assignedDetails.length > 0 ? (
          <>
            <img
              src="../../ar-tick/main-icon.svg"
              alt="Result"
              className="mx-auto w-[350px] h-auto"
            />

            <h2 className="font-semibold text-[#046a81] flex items-center justify-center gap-2">
              <FaSquareCheck className="text-green-600" />
              You have chosen
            </h2>

            <ul className="grid gap-4 md:grid-cols-2 px-2 md:px-6">
              {qrDetails?.assignedDetails.map((detail, index) => (
                <li
                  key={index}
                  className={`flex ${
                    index % 2 === 0 ? "flex-row" : "flex-row-reverse"
                  } rounded-lg items-center justify-between px-4 space-y-3 hover:shadow-lg transition`}
                >
                  <img
                    src={`../../ar-tick/${detail.title}.svg`}
                    alt={detail.title}
                    className="w-[40vw] h-auto object-contain"
                  />
                  <div className="flex flex-col justify-center items-center gap-2">
                    <img
                      src={`../../ar-tick/${detail.title}-text.svg`}
                      alt="text"
                      className="w-23"
                    />
                    <button
                      onClick={() => {
                        const fileName = `${detail.title}.${detail.fileType}`;
                        const link = document.createElement("a");
                        link.href = `../../ar-tick/${fileName}`; // Relative to current base path
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
              ))}
            </ul>
          </>
        ) : (
          <p className="text-gray-600 text-lg">
            No assigned details found for this QR code.
          </p>
        )}
      </div>
    </div>
  );
};

export default Result;

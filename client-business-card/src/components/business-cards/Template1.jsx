import { useEffect, useState } from "react";
import axios from "axios";
import { useParams, useNavigate } from "react-router-dom";
import CachedImage from "../CachedImage";
import { FaFacebook, FaHospital, FaAward, FaBookReader } from "react-icons/fa";
import { FaSquareInstagram, FaSquareXTwitter } from "react-icons/fa6";
import { IoLogoLinkedin, IoCopy } from "react-icons/io5";
import { IoMdContact } from "react-icons/io";
import { LuContactRound } from "react-icons/lu";
import { FiEdit2 } from "react-icons/fi";
import { useAuth } from "../../contexts/AuthContext";

const Template1 = () => {
  const { user } = useAuth();
  const { qrId, templateId } = useParams();
  const [qrData, setQrData] = useState(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function fetchQRDetails() {
      try {
        const res = await axios.get(
          `${import.meta.env.VITE_API_URL}/qr/details/${qrId}`
        );
        setQrData(res.data);
      } catch (err) {
        console.error("Failed to fetch QR details:", err);
        setError("Failed to load card data");
      } finally {
        setLoading(false);
      }
    }
    fetchQRDetails();
  }, [qrId]);

  if (loading)
    return <div className="text-center mt-10 text-lg">Loading...</div>;
  if (error)
    return (
      <div className="text-center mt-10 text-lg text-red-500">{error}</div>
    );
  if (!qrData || !qrData.assignedDetails)
    return <div className="text-center mt-10 text-lg">No data available</div>;

  const {
    profileImage,
    name,
    role,
    hospitalUrl,
    hospital1,
    hospital2,
    hospital3,
    address,
    award1,
    award2,
    research,
    facebook,
    instagram,
    twitter,
    linkedIn,
    phone,
    email,
  } = qrData.assignedDetails;

  return (
    <div className="font-['Poppins'] bg-[#e2e0df] min-h-[100dvh] flex flex-col items-center justify-center overflow-hidden">
      <div
        className="w-full max-w-[300px] aspect-[9/16] relative"
        style={{ perspective: "1000px" }}
      >
        <div
          className={`w-full h-full relative transition-transform duration-700 ease-in-out ${
            isFlipped ? "-rotate-y-180" : ""
          }`}
          style={{ transformStyle: "preserve-3d" }}
          onClick={() => setIsFlipped(!isFlipped)}
        >
          {/* Front Face */}
          <div className="absolute w-full h-full backface-hidden rounded-[15px] overflow-hidden">
            <img
              src="/business-card/Template1-BG-Front.png"
              alt="Front"
              className="w-full h-full object-cover"
            />
            {/* Profile Image */}
            <div className="absolute top-5 left-21 w-[132px] h-[132px] rounded-full overflow-hidden border-2 border-white">
              <CachedImage
                imageKey={profileImage}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Name, Role & Hospital */}
            {name && role && hospital1 && (
              <div className="absolute top-38 w-full flex items-center justify-center">
                <div className="text-white text-lg font-bold font-sans flex flex-col justify-center items-center">
                  <p>{name}</p>
                  <p className="text-amber-500 text-[11px] font-medium">
                    {role}
                  </p>
                  <p className="text-[10px] font-medium">{hospital1.name}</p>
                </div>
              </div>
            )}

            {/* QR Image */}
            <div className="absolute top-90 left-22 w-[120px] h-[120px] rounded-xl overflow-hidden border-2 border-gray-500 p-2 bg-white">
              <img
                src={`${import.meta.env.VITE_API_URL}/qr-codes/${qrId}.svg`}
                alt="Front"
                className="w-full h-full object-cover "
              />
            </div>

            {/* Phone, Email, Website & Address */}
            {phone && email && hospitalUrl && address && (
              <div className="absolute top-58.5 left-15 text-white text-xs font-medium font-sans flex flex-col justify-center space-y-3.5">
                <p>{phone}</p>
                <p>{email}</p>
                <p>{hospitalUrl}</p>
                <p>{address}</p>
              </div>
            )}
          </div>

          {/* Back Face */}
          <div className="absolute w-full h-full backface-hidden rotate-y-180 rounded-[15px] overflow-hidden">
            <img
              src="/business-card/Template1-BG-Back.png"
              alt="Back"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 p-5 flex flex-col items-center justify-start overflow-auto text-white">
              {/* Profile Image */}
              <div className="absolute top-5 left-5 w-[70px] h-[70px] rounded-full overflow-hidden border-2 border-white">
                <CachedImage
                  imageKey={profileImage}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Name & Role */}
              {name && (
                <div className="absolute top-8 left-25 text-base font-bold font-sans">
                  {name}
                </div>
              )}

              {/* Hospital Info */}
              <div className="mt-[90px] text-xs text-left w-full max-w-[240px] space-y-1">
                {(hospital1?.name || hospital2?.name || hospital3?.name) && (
                  <>
                    <h3 className="flex items-center gap-2 font-bold">
                      <FaHospital />
                      <p>Hospitals & Availability</p>
                    </h3>
                    <ul className="list-disc marker:text-yellow-400 pl-6 text-[10px] font-sans font-extralight space-y-1">
                      {hospital1?.name && (
                        <li>
                          <strong>{hospital1.name}</strong>
                          {hospital1.visitingHours && (
                            <div className="-mt-[2px]">
                              {hospital1.visitingHours}
                            </div>
                          )}
                        </li>
                      )}
                      {hospital2?.name && (
                        <li>
                          <strong>{hospital2.name}</strong>
                          {hospital2.visitingHours && (
                            <div className="-mt-[2px]">
                              {hospital2.visitingHours}
                            </div>
                          )}
                        </li>
                      )}
                      {hospital3?.name && (
                        <li>
                          <strong>{hospital3.name}</strong>
                          {hospital3.visitingHours && (
                            <div className="-mt-[2px]">
                              {hospital3.visitingHours}
                            </div>
                          )}
                        </li>
                      )}
                    </ul>
                  </>
                )}
              </div>

              {/* Research */}
              {research && (
                <div className="mt-4 text-xs text-left w-full max-w-[240px]">
                  <h3 className="flex items-center gap-2 font-bold">
                    <FaBookReader />
                    Research & Publications
                  </h3>
                  <div className="pl-6 mt-1 font-sans font-extralight">
                    {research.split("\n").map((item, index) => (
                      <p key={index}>{item}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Awards */}
              {(award1 || award2) && (
                <div className="mt-4 text-xs text-left w-full max-w-[240px]">
                  <h3 className="flex items-center gap-2 font-bold">
                    <FaAward />
                    Awards & Recognition
                  </h3>
                  <ul className="pl-6 mt-1 space-y-1 font-sans font-extralight">
                    {award1 && <li>{award1}</li>}
                    {award2 && <li>{award2}</li>}
                  </ul>
                </div>
              )}

              {/* Contact Info */}
              {(phone || email) && (
                <div className="mt-4 text-xs text-left w-full max-w-[240px]">
                  <h3 className="flex items-center gap-2 font-bold">
                    <IoMdContact />
                    Contact
                  </h3>
                  <ul className="pl-6 mt-1 space-y-1 font-sans font-extralight">
                    {phone && <li>Phone: {phone}</li>}
                    {email && <li>Email: {email}</li>}
                  </ul>
                </div>
              )}

              {/* Social Links */}
              <div className="flex gap-4 mt-6">
                {facebook && (
                  <a href={facebook} target="_blank" rel="noopener noreferrer">
                    <FaFacebook size={25} />
                  </a>
                )}
                {instagram && (
                  <a href={instagram} target="_blank" rel="noopener noreferrer">
                    <FaSquareInstagram size={25} />
                  </a>
                )}
                {linkedIn && (
                  <a href={linkedIn} target="_blank" rel="noopener noreferrer">
                    <IoLogoLinkedin size={25} />
                  </a>
                )}
                {twitter && (
                  <a href={twitter} target="_blank" rel="noopener noreferrer">
                    <FaSquareXTwitter size={25} />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Save Contact & Copy URL Buttons */}
      {qrData.qrId && (
        <div className="mt-6 flex gap-4 sm:items-center">
          {user?.objId === qrData?.creator.userObjId ||
          user?.role === "admin" ? (
            <button
              className="cursor-pointer font-sans flex items-center justify-center gap-2 bg-gray-600 hover:bg-gray-700 text-white font-medium px-6 py-2 rounded-full text-sm transition-all hover:shadow-md"
              onClick={() => navigate(`/form/${qrId}/${templateId}`)}
            >
              <FiEdit2 size={14} />
              <span>Edit Details</span>
            </button>
          ) : (
            <button
              onClick={() => {
                const fullUrl = `${window.location.origin}/card/${qrData.qrId}`;
                navigator.clipboard.writeText(fullUrl);
                toast.success("URL copied to clipboard!", {
                  id: "copy-success",
                });
              }}
              className="flex items-center justify-center gap-2 cursor-pointer px-6 py-2 bg-gray-400 text-white font-sans text-sm font-bold rounded-full shadow-md hover:bg-gray-500 transition"
            >
              <IoCopy />
              Copy URL
            </button>
          )}

          {/* Save Contact */}
          <a
            href={`${import.meta.env.VITE_API_URL}/qr/generateVCard/${qrId}`}
            download={`doctor-contact.vcf`}
            className="whitespace-nowrap flex items-center justify-center gap-2 cursor-pointer px-6 py-2 bg-[#007bff] text-white font-sans text-sm font-bold rounded-full shadow-md hover:bg-[#0056b3] transition"
          >
            <LuContactRound color="white" />
            Save Contact
          </a>
        </div>
      )}
    </div>
  );
};

export default Template1;

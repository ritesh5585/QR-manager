import { useState, useEffect } from 'react';
import { CheckIcon } from '@heroicons/react/24/outline';
import { useNavigate, useParams } from 'react-router-dom';
import LayoutWrapper from '../layouts/LayoutWrapper';
import { MdOutlineArrowBack } from "react-icons/md";
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';

const templates = [
  {
    id: 1,
    name: "Classic Blue",
    image: "/business-card/Template1.png",
    status: "active"
  },
  {
    id: 2,
    name: "Minimal White",
    image: "/business-card/Template2.png",
    status: "notActive"
  },
  {
    id: 3,
    name: "Elegant Black",
    image: "/business-card/Template3.png",
    status: "notActive"
  },
  {
    id: 4,
    name: "Modern Gradient",
    image: "/business-card/Template4.png",
    status: "notActive"
  },
  {
    id: 5,
    name: "Rouded Glossy",
    image: "/business-card/Template5.png",
    status: "notActive"
  },
];

export default function Templates() {
  const [selected, setSelected] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [unauthorized, setUnauthorized] = useState(false);
  const navigate = useNavigate();
  const { qrId } = useParams();
  const { user } = useAuth();

  useEffect(() => {
    async function getQRDetails() {
      try {
        const response = await axios.get(`${import.meta.env.VITE_API_URL}/qr/details/${qrId}`);
        const qr = response.data;

        // If QR doesn't belong to the logged-in user
        if (qr.creator?.userObjId !== user?.objId && user?.role !=="admin") {
          setUnauthorized(true);
        }
      } catch (error) {
        console.error("Failed to load QR details", error);
      }
    }

    if (qrId && user?.objId) {
      getQRDetails();
    }
  }, [qrId, user?.objId]);


  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkIfMobile();
    window.addEventListener('resize', checkIfMobile);
    
    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  const handleDeselect = () => {
    setSelected(null);
  };

  if (unauthorized) {
    return (
      <LayoutWrapper>
        <div className="min-h-[calc(100dvh-14dvh)] flex items-center justify-center text-center px-4">
          <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg shadow-sm">
            <h2 className="text-lg font-semibold">Access Denied</h2>
            <p>This QR doesn’t belong to you.<br />Try Logging in with the same account that was used to create the QR<br /> OR Contact Head Office</p>
          </div>
        </div>
      </LayoutWrapper>
    );
  }

  return (
    <LayoutWrapper>
      <div className="min-h-[calc(100dvh-14dvh)]">
        <div className={`mx-auto space-y-3 md:space-y-6 ${isMobile && selected && "mb-15"}`}>
          <div className="flex justify-between items-center sm:mb-10">
            <div className='flex items-center justify-center gap-2 sm:gap-4'>
              <button
                onClick={() => window.history.back()}
                className='p-2 bg-gray-300 rounded-full cursor-pointer'
              >
                <MdOutlineArrowBack />
              </button>
              <h1 className="text-md sm:text-xl font-bold text-gray-800">
                Select a Business Card Template
              </h1>
            </div>

            {/* Desktop Buttons */}
            <div className="hidden md:flex items-center justify-center gap-4">
              {selected && (
                <button
                  onClick={handleDeselect}
                  className="cursor-pointer bg-white text-gray-700 border border-gray-300 px-6 py-2 rounded-lg shadow hover:bg-gray-50 transition"
                > 
                  Cancel
                </button>
              )}
              <button
                className="cursor-pointer bg-blue-600 text-white px-6 py-2 rounded-lg shadow hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!selected}
                onClick={() => navigate(`/form/${qrId}/${selected}`)}
              >
                Continue
              </button>
            </div>
            
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-12 justify-center">
            {templates.map((template) => (
              <button
                key={template.id}
                className={`relative border-2 rounded-xl p-2 sm:m-2 cursor-pointer disabled:cursor-not-allowed transition-all duration-200 hover:scale-[1.02] ${
                  selected === template.id
                    ? 'border-blue-600 shadow-lg scale-[1.02]'
                    : 'border-transparent hover:border-gray-200'
                }`}
                disabled={template.status === "notActive"}
                onClick={() => setSelected(template.id)}
              >
                <div className="aspect-w-3 aspect-h-2 w-full overflow-hidden rounded-lg">
                  <img
                    src={template.image}
                    alt={template.name}
                    className="w-full object-cover rounded-lg"
                  />
                </div>
                <div className="absolute top-4 right-4 bg-white rounded-full p-1 shadow-sm">
                  {selected === template.id && (
                    <CheckIcon className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
                  )}
                  {template.status === "notActive" && (
                    <div className='text-xs text-gray-500'>Coming Soon</div>
                  )}
                </div>
                <p className="mt-2 sm:mt-3 text-sm sm:text-base text-center text-gray-700 font-medium">
                  {template.name}
                </p>
              </button>
            ))}
          </div>

          
        </div>

        {/* Mobile Sticky Buttons */}
        {isMobile && selected && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-3 px-4 shadow-lg md:hidden">
            <div className="flex gap-3">
              <button
                onClick={handleDeselect}
                className="flex-1 bg-white text-gray-700 border border-gray-300 py-2 rounded-lg shadow hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg shadow hover:bg-blue-700 transition"
                onClick={() => navigate(`/form/${qrId}/${selected}`)}
              >
                Continue
              </button>
            </div>
          </div>
        )}
      </div>
    </LayoutWrapper>
  );
}
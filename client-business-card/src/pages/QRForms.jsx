import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import LayoutWrapper from '../layouts/LayoutWrapper';
import Template1 from '../components/template-forms/Template-1';
import Template2 from '../components/template-forms/Template-2';
import Template3 from '../components/template-forms/Template-3';
import Template4 from '../components/template-forms/Template-4';
import Template5 from '../components/template-forms/Template-5';

export default function QRForms() {
  const { qrId, templateId } = useParams();
  const [qrDetails, setQrDetails] = useState(null);
  const [unauthorized, setUnauthorized] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    async function fetchQRDetails() {
      try {
        const response = await axios.get(`${import.meta.env.VITE_API_URL}/qr/details/${qrId}`);
        const qr = response.data;
        setQrDetails(qr);

        if (qr.creator?.userObjId !== user?.objId && user?.role !=="admin") {
          setUnauthorized(true);
        }
      } catch (error) {
        console.error("Error fetching QR details:", error);
      }
    }

    if (qrId && user?.objId) {
      fetchQRDetails();
    }
  }, [qrId, user?.objId]);

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

  if (!qrDetails) {
    return (
      <LayoutWrapper>
        <div className="min-h-[calc(100dvh-14dvh)] flex items-center justify-center text-gray-500">
          Loading...
        </div>
      </LayoutWrapper>
    );
  }

  const renderTemplate = () => {
    switch (templateId) {
      case "1":
        return <Template1 qrId={qrId} />;
      case "2":
        return <Template2 qrId={qrId} />;
      case "3":
        return <Template3 qrId={qrId} />;
      case "4":
        return <Template4 qrId={qrId} />;
      case "5":
        return <Template5 qrId={qrId} />;
      default:
        return <div className='min-h-[calc(100dvh-14dvh)] flex justify-center items-center text-xl font-medium'>No template found for this ID: {templateId}</div>;
    }
  };

  return <LayoutWrapper>{renderTemplate()}</LayoutWrapper>;
}

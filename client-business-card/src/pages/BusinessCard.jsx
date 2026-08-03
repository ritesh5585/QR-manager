import Template1 from '../components/business-cards/Template1';
import Template2 from '../components/business-cards/Template2';
import Template3 from '../components/business-cards/Template3';
import Template4 from '../components/business-cards/Template4';
import Template5 from '../components/business-cards/Template5';
import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function BusinessCard() {
  const { templateId } = useParams();
  const { user } = useAuth();

  const templates = {
    1: Template1,
    2: Template2,
    3: Template3,
    4: Template4,
    5: Template5,
  };

  const SelectedTemplate = templates[templateId];

  return SelectedTemplate ? (
    <SelectedTemplate />
  ) : (
    <div className='h-[85vh] flex justify-center items-center text-xl'>Invalid Template ID</div>
  );
}

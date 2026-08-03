import GlobalLayout from '../layouts/GlobalLayout';
import AdminLayout from '../layouts/AdminLayout';
import { useAuth } from '../contexts/AuthContext';

const LayoutWrapper = ({ children }) => {
    const {user} = useAuth();

    if (user?.role === 'admin') {
    return <AdminLayout>{children}</AdminLayout>;
    }
    return <GlobalLayout>{children}</GlobalLayout>;
};

export default LayoutWrapper;
import { useLocation, Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function PrivateRoute({ children, allowedRoles }) {
  const { user } = useAuth();
  const location = useLocation();
  const isManualLogout = localStorage.getItem("isManualLogout");

  // Not logged in
  if (!user) {
    if(isManualLogout){
      return <Navigate to="/login" replace state={{ }} />;
    } else{
      return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }
  }

  // If role restriction exists, check role
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  // Authenticated and allowed
  return children;
}

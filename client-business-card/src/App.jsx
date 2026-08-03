import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Templates from "./pages/Templates";
import { AuthProvider } from "./contexts/AuthContext";
import PrivateRoute from "./routes/PrivateRoute";
import AdminDashboard from "./pages/AdminDashBoard";
import AdminManageCredits from "./pages/AdminManageCredits";
import AdminManageQRs from "./pages/AdminManageQRs";
import AdminTransaction from "./pages/AdminTransaction";
import AdminReport from "./pages/AdminReport";
import DashBoard from "./pages/Dashboard";
import ManageCredits from "./pages/ManageCredits";
import ManageQRs from "./pages/ManageQR";
import Transaction from "./pages/Transaction";
import Report from "./pages/Report";
import QRForms from "./pages/QRForms";
import BusinessCard from "./pages/BusinessCard";

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public route */}
        <Route path="/login" element={<Login />} />

        <Route
          path="card/:qrId/:templateId"
          element={<BusinessCard />}
        />

        {/* Protected User Routes */}
        <Route
          path="/dashboard"
          element={<PrivateRoute><DashBoard /></PrivateRoute>}
        />
        <Route
          path="/managecredits"
          element={<PrivateRoute><ManageCredits /></PrivateRoute>}
        />
        <Route
          path="/manageQRs"
          element={<PrivateRoute><ManageQRs /></PrivateRoute>}
        />
        <Route
          path="/transactions"
          element={<PrivateRoute><Transaction /></PrivateRoute>}
        />
        <Route
          path="/report"
          element={<PrivateRoute><Report /></PrivateRoute>}
        />
        <Route
          path="templates/:qrId"
          element={<PrivateRoute><Templates /></PrivateRoute>}
        />
        <Route
          path="form/:qrId/:templateId"
          element={<PrivateRoute><QRForms /></PrivateRoute>}
        />

        {/* Admin Routes */}
        <Route
          path="/admin"
          element={<Navigate to="/admin/dashboard" replace />}
        />
        <Route
          path="/admin/dashboard"
          element={<PrivateRoute allowedRoles={['admin']}><AdminDashboard /></PrivateRoute>}
        />
        <Route
          path="/admin/managecredits"
          element={<PrivateRoute allowedRoles={['admin']}><AdminManageCredits /></PrivateRoute>}
        />
        <Route
          path="/admin/manageQRs"
          element={<PrivateRoute allowedRoles={['admin']}><AdminManageQRs /></PrivateRoute>}
        />
        <Route
          path="/admin/transactions"
          element={<PrivateRoute allowedRoles={['admin']}><AdminTransaction /></PrivateRoute>}
        />
        <Route
          path="/admin/report"
          element={<PrivateRoute allowedRoles={['admin']}><AdminReport /></PrivateRoute>}
        />

        {/* Redirect root to dashboard */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />

        {/* Unauthorized route */}
        <Route
          path="/unauthorized"
          element={(
            <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-gray-100 text-gray-800 px-4">
              <h1 className="text-xl md:text-xl lg:text-4xl font-bold mb-4">401 - Unauthorized</h1>
              <p className="text-sm sm:text-lg mb-6 text-center">This page is restricted to you</p>
              <a
                href="/"
                className="inline-block bg-blue-600 text-white px-5 py-2 rounded-md shadow hover:bg-blue-700 transition"
              >
                Go to Dashboard
              </a>
            </div>
          )}
        />

        {/* 404 fallback */}
        <Route
          path="*"
          element={(
            <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-gray-100 text-gray-800 px-4">
              <h1 className="text-xl md:text-xl lg:text-4xl font-bold mb-4">404 - Page Not Found</h1>
              <p className="text-sm sm:text-lg mb-6 text-center">
                Sorry, the page you are looking for does not exist.
              </p>
              <a
                href="/"
                className="inline-block bg-blue-600 text-white px-5 py-2 rounded-md shadow hover:bg-blue-700 transition"
              >
                Go to Dashboard
              </a>
            </div>
          )}
        />
      </Routes>
    </AuthProvider>
  );
}

export default App;

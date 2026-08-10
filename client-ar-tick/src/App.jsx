// src/App.jsx

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import DocumentScanner from "./pages/DocumentScanner";
import Result from "./pages/Result";

function App() {
  return (
    
      <Routes>
        <Route path="/" element={<Navigate to="/scan/xi9Anc" replace />} />
        <Route path="/scan/:qrId" element={<DocumentScanner />} />
        <Route path="/result/:qrId" element={<Result />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
  
  );
}

const NotFoundPage = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <div className="bg-gray-900 rounded-lg p-8 max-w-md w-full text-center shadow-2xl">
        <div className="text-6xl mb-4">🔍</div>
        <h1 className="text-2xl font-bold text-white mb-2">
          Page Not Found
        </h1>
        <p className="text-gray-400 mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <button
          onClick={() => (window.location.href = "/")}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          Go to Scanner
        </button>
      </div>
    </div>
  );
};

export default App;

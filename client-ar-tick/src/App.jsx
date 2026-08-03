import { Routes, Route } from "react-router-dom";
import "./config/axios";
import DocumentScanner from "./pages/DocumentScanner";
import Result from "./pages/Result";

function App() {
  return (
    <Routes>
      <Route path="/" element={<DocumentScanner />} />
      <Route path="/scan/:qrId" element={<DocumentScanner />} />
      <Route path="/result/:qrId" element={<Result />} />

      {/* 404 fallback */}
      <Route
        path="*"
        element={
          <div className="flex flex-col items-center justify-center min-h-[100dvh] bg-gray-100 text-gray-800 px-4">
            <h1 className="text-xl md:text-xl lg:text-4xl font-bold mb-4">
              404 - Page Not Found
            </h1>
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
        }
      />
    </Routes>
  );
}

export default App;

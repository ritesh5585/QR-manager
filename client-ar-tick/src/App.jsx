// src/App.jsx

import { BrowserRouter, Routes, Route } from "react-router-dom";
import DocumentScanner from "./pages/DocumentScanner";
import Result from "./pages/Result";
import { Toaster } from "react-hot-toast";
import ErrorModal from "./components/ErrorModal";

function App() {
  return (
    <>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/scan/:qrId" element={<DocumentScanner />} />
        <Route path="/result/:qrId" element={<Result />} />
        <Route path="*" element={<ErrorModal />} />
      </Routes>
    </>
  );
}

export default App;

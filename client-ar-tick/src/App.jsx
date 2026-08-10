// src/App.jsx

import { BrowserRouter, Routes, Route } from "react-router-dom";
import DocumentScanner from "./pages/DocumentScanner";
import Result from "./pages/Result";
import { Toaster } from "react-hot-toast";

function App() {
  return (
    <>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/" element={<DocumentScanner />} />
        <Route path="/result/:qrId" element={<Result />} />
        <Route path="*" element={<DocumentScanner />} />
      </Routes>
    </>
  );
}

export default App;

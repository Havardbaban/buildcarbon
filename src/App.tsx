import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Demo from "./pages/Demo";
import Benchmark from "./pages/Benchmark";
import Invoices from "./pages/Invoices";
import Nav from "./components/Nav";
import TestInvoiceUpload from "./TestInvoiceUpload";
import InvoiceDetailPage from "./pages/InvoiceDetail"; // ✅
import Measures from "./pages/Measures";               // ✅ NEW


export default function App() {
  return (
    <BrowserRouter>
      <Nav />
     <Routes>
  <Route path="/" element={<Home />} />
  <Route path="/demo" element={<Demo />} />
  <Route path="/benchmark" element={<Benchmark />} />
  <Route path="/invoices" element={<Invoices />} />
  <Route path="/test-upload" element={<TestInvoiceUpload />} />
  <Route path="/invoice/:id" element={<InvoiceDetailPage />} />
  <Route path="/measures" element={<Measures />} /> {/* NEW */}
</Routes>

    </BrowserRouter>
  );
}

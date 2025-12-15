// src/App.tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import Demo from "./pages/Demo";
import Benchmark from "./pages/Benchmark";
import Invoices from "./pages/Invoices";
import InvoiceDetailPage from "./pages/InvoiceDetail";
import Measures from "./pages/Measures";
import DashboardPage from "./pages/Dashboard";
import ESG from "./pages/ESG";
import UploadInvoicePage from "./pages/UploadInvoice";
import DocumentsPage from "./pages/Documents";
import ProjectsPage from "./pages/Projects"; // ✅ NY

import AppShell from "./components/AppShell";

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Home />} />

          {/* Deaktivert i MVP */}
          <Route path="/demo" element={<Demo disabled={true} />} />
          <Route path="/benchmark" element={<Benchmark disabled={true} />} />

          {/* Aktive sider */}
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/invoice/:id" element={<InvoiceDetailPage />} />
          <Route path="/upload" element={<UploadInvoicePage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/measures" element={<Measures />} />
          <Route path="/projects" element={<ProjectsPage />} /> {/* ✅ NY */}
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/esg" element={<ESG />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}

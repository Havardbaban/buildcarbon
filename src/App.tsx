// src/App.tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import Demo from "./pages/Demo";
import Benchmark from "./pages/Benchmark";
import Invoices from "./pages/Invoices";
import Nav from "./components/Nav";
import InvoiceDetailPage from "./pages/InvoiceDetail";
import Measures from "./pages/Measures";
import DashboardPage from "./pages/Dashboard";
import ESG from "./pages/ESG";

export default function App() {
  return (
    <BrowserRouter>
      <Nav />

      <Routes>
        <Route path="/" element={<Home />} />

        {/* 🔒 Deaktivert | "Coming soon" */}
        <Route
          path="/demo"
          element={<Demo disabled={true} />}
        />
        <Route
          path="/benchmark"
          element={<Benchmark disabled={true} />}
        />

        {/* Aktive sider */}
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/invoice/:id" element={<InvoiceDetailPage />} />
        <Route path="/measures" element={<Measures />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/esg" element={<ESG />} />
      </Routes>
    </BrowserRouter>
  );
}

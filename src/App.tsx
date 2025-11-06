import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Demo from "./pages/Demo";
import Benchmark from "./pages/Benchmark";
import EnvestoReport from "./EnvestoReport"; // use as a simple /report page

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/demo" element={<Demo />} />
        <Route path="/benchmark" element={<Benchmark />} />
        <Route
          path="/report"
          element={
            <div className="mx-auto max-w-6xl p-6">
              <EnvestoReport
                inputs={{
                  energySpend: 100000,
                  reductionPct: 15,
                  grant: 10000,
                  loanAmount: 500000,
                  rateCurrent: 4.0,
                  rateGreen: 3.5,
                  capex: 200000,
                  taxRate: 22,
                  consultantFees: 5000,
                }}
                companyName="Acme AS"
                projectTitle="Energy Efficiency Upgrade"
              />
            </div>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

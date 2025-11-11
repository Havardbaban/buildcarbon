import { Link } from "react-router-dom";
import TestSupabase from "../TestSupabase";

export default function Home() {
  return (
    <div>

      <main className="mx-auto max-w-6xl px-4 py-12">
        <section className="grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold leading-tight">
              Turn sustainability into profit.
            </h1>
            <p className="mt-4 text-slate-600 text-lg">
              Envesto finds cost savings, grants, and carbon reductions—then
              produces a bank-ready report (NPV, IRR, DSCR, Payback).
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/demo" className="rounded-xl px-5 py-3 text-white" style={{ background: "#0E90FE" }}>
                Try the Demo
              </Link>
              <Link to="/report" className="rounded-xl px-5 py-3 border">New Report Builder</Link>
              <a href="mailto:hello@envesto.app?subject=Envesto%20Pilot%20Inquiry" className="rounded-xl px-5 py-3 border">
                Book a Call
              </a>
            </div>
          </div>

          <div className="border rounded-2xl p-6 bg-white">
            <div className="text-sm text-slate-500 mb-2">What you'll see in the demo</div>
            <div className="rounded-xl border p-4">
              <div className="font-semibold">Acme AS — Office Efficiency Upgrade</div>
              <ul className="mt-2 text-sm text-slate-700 space-y-1">
                <li>Baseline energy: NOK 100 000 / yr</li>
                <li>Reduction target: 15 %</li>
                <li>After-tax savings: ≈ NOK 11 700 / yr</li>
                <li>Loan tenor: 5 yrs • Discount rate: 8 %</li>
              </ul>
              <div className="mt-3 text-xs text-slate-500">
                Download a multi-page PDF with finance tables and compliance notes.
              </div>
            </div>
          </div>
        </section>

        <section className="mt-12 grid gap-2 text-sm text-slate-700">
          <ul className="list-disc ml-6 space-y-1">
            <li>Financial-grade outputs (NPV, IRR, DSCR, Payback)</li>
            <li>Opportunities library (what to cut & why)</li>
            <li>Grants & incentives (coming in MVP)</li>
            <li>Bank/insurer/tax-ready PDF/CSV</li>
          </ul>
        </section>

        {/* Supabase connection sanity-check */}
        <section className="mt-12 border-t pt-6">
          <h2 className="text-xl font-semibold mb-3">Supabase Connection Test</h2>
          <TestSupabase />
        </section>
      </main>
    </div>
  );
}

// src/pages/Home.tsx
import { Link } from "react-router-dom";

export default function Home() {
  return (
    <main className="bc-section">
      {/* Hero */}
      <section className="grid gap-8 md:grid-cols-2 items-center">
        <div className="space-y-4">
          <h1 className="text-3xl md:text-4xl font-semibold leading-tight text-slate-900">
            Gjør <span className="text-emerald-600">fakturaer</span> om til
            klimarapporter – automatisk.
          </h1>
          <p className="text-sm md:text-base text-slate-600">
            BuildCarbon leser leverandørfakturaer, beregner CO₂-utslipp og
            bygger banker- og støtteordningsklare rapporter. Ingen Excel. Ingen
            manuell punching.
          </p>

          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              to="/upload"
              className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
            >
              Last opp første faktura
            </Link>
            <Link
              to="/dashboard"
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Gå til dashboard
            </Link>
          </div>

          <ul className="mt-4 space-y-1 text-sm text-slate-600">
            <li>• Automatisk CO₂ fra strøm, varme, drivstoff m.m.</li>
            <li>• Klare grafer for styre, bank og revisor</li>
            <li>• Dokumentasjon via lenke til original faktura-PDF</li>
          </ul>
        </div>

        <div className="bc-card space-y-4">
          <h2 className="text-sm font-semibold text-slate-700">
            Hva du ser i demoen
          </h2>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700 space-y-1">
            <div className="font-semibold text-slate-900">
              Demo Org — Office Efficiency Upgrade
            </div>
            <div>Baseline energi: 100 000 kWh / år</div>
            <div>Reduksjonsmål: 15 %</div>
            <div>Årlige etter-skatt besparelser: ≈ 11 700 kr</div>
          </div>
          <p className="text-[11px] text-slate-500">
            Alle tall er generert fra ekte fakturaer via MVP-en din. Bruk
            dem som pitch mot banker, piloter og støtteordninger.
          </p>
        </div>
      </section>

      {/* Supabase-test / info */}
      <section className="bc-card space-y-2">
        <h2 className="text-sm font-semibold text-slate-800">
          Supabase-tilkobling
        </h2>
        <p className="text-sm text-slate-600">
          Demo Org er koblet mot databasen din. Når du laster opp fakturaer,
          oppdateres tallene i fakturaliste, tiltak, dashboard, ESG og
          dokumentsiden automatisk.
        </p>
      </section>
    </main>
  );
}

// src/components/Nav.tsx
import { Link, useLocation } from "react-router-dom";
import { ACTIVE_ORG_ID } from "../lib/org";

export default function Nav() {
  const { pathname } = useLocation();

  const linkClass = (path: string) =>
    [
      "rounded-full px-3 py-1 text-sm font-medium transition",
      pathname === path
        ? "bg-emerald-600 text-white shadow-sm"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
    ].join(" ");

  return (
    <header className="border-b bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        {/* Venstre: logo + beta */}
        <div className="flex items-center gap-3">
          <Link
            to="/invoices"
            className="text-lg font-semibold tracking-tight text-emerald-700"
          >
            BuildCarbon
          </Link>
          <span className="bc-badge text-[10px]">MVP · Beta</span>
        </div>

        {/* Midt: hovedmeny */}
        <nav className="hidden items-center gap-2 md:flex">
          {/* Fakturaer = Last opp + Dokumenter på samme side */}
          <Link className={linkClass("/invoices")} to="/invoices">
            Fakturaer
          </Link>

          {/* Tiltak */}
          <Link className={linkClass("/measures")} to="/measures">
            Tiltak
          </Link>

          {/* Dashboard (finans) */}
          <Link className={linkClass("/dashboard")} to="/dashboard">
            Dashboard
          </Link>

          {/* ESG (scope 1–3 + score) */}
          <Link className={linkClass("/esg")} to="/esg">
            ESG
          </Link>
        </nav>

        {/* Høyre: org + demo/benchmark (deaktiverte) */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className="text-xs text-slate-500">Aktiv org</span>
            <span className="text-xs font-medium text-slate-800">
              Demo Org ({ACTIVE_ORG_ID.slice(0, 8)}…)
            </span>
          </div>

          <div className="hidden items-center gap-1 md:flex">
            <Link
              to="/demo"
              className="rounded-full px-2.5 py-1 text-[11px] text-slate-400 border border-slate-200 cursor-not-allowed"
            >
              Demo
            </Link>
            <Link
              to="/benchmark"
              className="rounded-full px-2.5 py-1 text-[11px] text-slate-400 border border-slate-200 cursor-not-allowed"
            >
              Benchmark
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

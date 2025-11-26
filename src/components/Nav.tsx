// src/components/Nav.tsx
import { Link, useLocation } from "react-router-dom";

export default function Nav() {
  const { pathname } = useLocation();

  const linkClass = (path: string) =>
    pathname === path
      ? "text-green-600 font-semibold border-b-2 border-green-600 pb-1"
      : "text-slate-700 hover:text-black";

  return (
    <nav className="w-full flex items-center justify-between px-6 py-4 border-b bg-white">
      <Link to="/" className="text-xl font-bold text-green-700">
        BuildCarbon
      </Link>

      <div className="flex items-center gap-6 text-sm">
        <Link className={linkClass("/invoices")} to="/invoices">
          Fakturaer
        </Link>

        <Link className={linkClass("/upload")} to="/upload">
          Last opp
        </Link>

        <Link className={linkClass("/documents")} to="/documents">
          Dokumenter
        </Link>

        <Link className={linkClass("/measures")} to="/measures">
          Tiltak
        </Link>

        <Link className={linkClass("/dashboard")} to="/dashboard">
          Dashboard
        </Link>

        <Link className={linkClass("/esg")} to="/esg">
          ESG
        </Link>

        <Link className={linkClass("/demo")} to="/demo">
          Demo
        </Link>

        <Link className={linkClass("/benchmark")} to="/benchmark">
          Benchmark
        </Link>
      </div>
    </nav>
  );
}

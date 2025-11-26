import { Link, useLocation } from "react-router-dom";

export default function Nav() {
  const { pathname } = useLocation();

  const linkClass = (path: string) =>
    `px-4 py-2 rounded-lg text-sm font-medium ${
      pathname === path
        ? "bg-green-600 text-white"
        : "text-slate-700 hover:bg-slate-200"
    }`;

  return (
    <nav className="w-full border-b bg-white">
      <div className="mx-auto max-w-6xl flex items-center justify-between px-4 h-14">

        {/* Logo */}
        <Link to="/" className="text-xl font-bold text-green-600">
          BuildCarbon
        </Link>

        {/* Menu */}
        <div className="flex space-x-2">
          <Link to="/invoices" className={linkClass("/invoices")}>
            Fakturaer
          </Link>

          <Link to="/measures" className={linkClass("/measures")}>
            Tiltak
          </Link>

          <Link to="/dashboard" className={linkClass("/dashboard")}>
            Dashboard
          </Link>

          <Link to="/esg" className={linkClass("/esg")}>
            ESG
          </Link>

          {/* Deactivated items */}
          <button
            disabled
            className="px-4 py-2 rounded-lg text-sm opacity-40 cursor-not-allowed"
          >
            Demo
          </button>

          <button
            disabled
            className="px-4 py-2 rounded-lg text-sm opacity-40 cursor-not-allowed"
          >
            Benchmark
          </button>
        </div>
      </div>
    </nav>
  );
}

// src/components/Nav.tsx

import { NavLink, Link } from "react-router-dom";

export default function Nav() {
  const base = "text-sm text-slate-600 hover:text-slate-900";
  const active = "text-sm text-slate-900 font-semibold underline";

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <div className="h-8 w-8 bg-green-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
            E
          </div>
          <span className="text-lg font-bold">Envesto</span>
        </Link>

        {/* Links */}
        <nav className="flex gap-4">
          <NavLink
            to="/"
            className={({ isActive }) => (isActive ? active : base)}
          >
            Home
          </NavLink>

          <NavLink
            to="/demo"
            className={({ isActive }) => (isActive ? active : base)}
          >
            Demo
          </NavLink>

          <NavLink
            to="/benchmark"
            className={({ isActive }) => (isActive ? active : base)}
          >
            Benchmark
          </NavLink>

          <NavLink
            to="/invoices"
            className={({ isActive }) => (isActive ? active : base)}
          >
            Invoices
          </NavLink>

          <NavLink
            to="/dashboard"
            className={({ isActive }) => (isActive ? active : base)}
          >
            Dashboard
          </NavLink>

          <NavLink
            to="/measures"
            className={({ isActive }) => (isActive ? active : base)}
          >
            Measures
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

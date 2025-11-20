import { Link, NavLink } from "react-router-dom";

export default function Nav() {
  const baseLink =
    "text-sm text-slate-600 hover:text-slate-900 hover:underline";
  const activeLink =
    "text-sm text-slate-900 font-semibold underline";

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
        {/* Logo / Brand */}
        <Link to="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-green-600 flex items-center justify-center text-white text-xs font-bold">
            E
          </div>
          <span className="text-lg font-semibold text-slate-900">
            Envesto
          </span>
        </Link>

        {/* Navigation */}
        <nav className="flex items-center gap-4">
          <NavLink
            to="/"
            className={({ isActive }) =>
              isActive ? activeLink : baseLink
            }
          >
            Home
          </NavLink>

          <NavLink
            to="/demo"
            className={({ isActive }) =>
              isActive ? activeLink : baseLink
            }
          >
            Demo
          </NavLink>

          <NavLink
            to="/benchmark"
            className={({ isActive }) =>
              isActive ? activeLink : baseLink
            }
          >
            Benchmark
          </NavLink>

          <NavLink
            to="/invoices"
            className={({ isActive }) =>
              isActive ? activeLink : baseLink
            }
          >
            Invoices
          </NavLink>

          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              isActive ? activeLink : baseLink
            }
          >
            ESG
          </NavLink>

          <NavLink
            to="/measures"
            className={({ isActive }) =>
              isActive ? activeLink : baseLink
            }
          >
            Measures
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

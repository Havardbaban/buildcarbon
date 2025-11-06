import { Link } from "react-router-dom";

export default function Nav() {
  return (
    <header className="border-b bg-white">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <Link to="/" className="font-bold text-xl tracking-tight">Envesto</Link>
        <nav className="flex items-center gap-6 text-sm">
          <Link to="/">Home</Link>
          <Link to="/demo">Demo</Link>
          <Link to="/benchmark">Benchmark</Link>
          <Link to="/report">Report</Link>
        </nav>
      </div>
    </header>
  );
}

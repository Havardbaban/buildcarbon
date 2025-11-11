
// …existing imports
import { Link } from "react-router-dom";

export default function Nav() {
  return (
    <nav className="flex items-center justify-between p-3 border-b">
      <a href="/" className="font-semibold flex items-center gap-2">
        <img src="/logo.png" alt="logo" className="h-6" />
        Envesto
      </a>
      <div className="flex gap-4 text-sm">
        <Link to="/">Home</Link>
        <Link to="/demo">Demo</Link>
        <Link to="/benchmark">Benchmark</Link>
        <Link to="/invoices">Invoices</Link> {/* NEW */}
      </div>
    </nav>
  );
}

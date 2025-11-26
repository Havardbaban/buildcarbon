import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { ACTIVE_ORG_ID } from "../lib/org";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";

type Doc = {
  id: string;
  supplier_name: string | null;
  total_amount: number | null;
  co2_kg: number | null;
  invoice_date: string | null;
};

export default function ESG() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("document")
        .select("id, supplier_name, total_amount, co2_kg, invoice_date")
        .eq("org_id", ACTIVE_ORG_ID);

      if (error) {
        console.error(error);
        setError("Kunne ikke hente ESG-data.");
      } else if (data) {
        setDocs(data as Doc[]);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <p className="p-6">Laster ESG-data…</p>;
  if (error)
    return (
      <div className="p-6 text-red-700 bg-red-50 border border-red-200 rounded">
        {error}
      </div>
    );

  const totalCo2 = docs.reduce((sum, d) => sum + (d.co2_kg ?? 0), 0);
  const totalCost = docs.reduce((sum, d) => sum + (d.total_amount ?? 0), 0);
  const invoiceCount = docs.length;

  const pieData = Object.values(
    docs.reduce((acc: any, d) => {
      if (!d.supplier_name) return acc;
      if (!acc[d.supplier_name])
        acc[d.supplier_name] = { name: d.supplier_name, value: 0 };
      acc[d.supplier_name].value += d.co2_kg ?? 0;
      return acc;
    }, {})
  );

  const lineData = Object.values(
    docs.reduce((acc: any, d) => {
      if (!d.invoice_date) return acc;
      const month = d.invoice_date.slice(0, 7);
      if (!acc[month]) acc[month] = { month, co2: 0 };
      acc[month].co2 += d.co2_kg ?? 0;
      return acc;
    }, {})
  ).sort((a: any, b: any) => a.month.localeCompare(b.month));

  const barData = Object.values(
    docs.reduce((acc: any, d) => {
      if (!d.supplier_name) return acc;
      if (!acc[d.supplier_name])
        acc[d.supplier_name] = { name: d.supplier_name, cost: 0 };
      acc[d.supplier_name].cost += d.total_amount ?? 0;
      return acc;
    }, {})
  );

  const COLORS = ["#22C55E", "#0EA5E9", "#6366F1", "#F59E0B", "#EF4444"];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 space-y-10">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-3xl font-semibold">ESG Oversikt</h1>
        <span className="text-xs text-slate-500">
          Org: Demo Org ({ACTIVE_ORG_ID.slice(0, 8)}…)
        </span>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="rounded-xl shadow p-5 bg-white">
          <div className="text-sm text-slate-500">Total CO₂</div>
          <div className="text-2xl font-bold">{totalCo2.toFixed(1)} kg</div>
        </div>
        <div className="rounded-xl shadow p-5 bg-white">
          <div className="text-sm text-slate-500">Totale kostnader</div>
          <div className="text-2xl font-bold">
            {totalCost.toLocaleString("nb-NO")} kr
          </div>
        </div>
        <div className="rounded-xl shadow p-5 bg-white">
          <div className="text-sm text-slate-500">Antall fakturaer</div>
          <div className="text-2xl font-bold">{invoiceCount}</div>
        </div>
      </div>

      <section>
        <h2 className="text-xl font-semibold mb-3">CO₂ per leverandør</h2>
        <div className="h-72 bg-white rounded-xl shadow p-4">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                dataKey="value"
                data={pieData}
                innerRadius={50}
                outerRadius={90}
                paddingAngle={4}
              >
                {pieData.map((_: any, i: number) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">CO₂ utvikling over tid</h2>
        <div className="h-72 bg-white rounded-xl shadow p-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="co2" stroke="#0EA5E9" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-3">Kostnader per leverandør</h2>
        <div className="h-72 bg-white rounded-xl shadow p-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="cost" fill="#22C55E" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </main>
  );
}

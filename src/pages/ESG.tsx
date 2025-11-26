// src/pages/ESG.tsx
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
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
  supplier: string | null;
  total_amount: number | null;
  co2_kg: number | null;
  invoice_date: string | null;
};

export default function ESG() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("document")
        .select("*");

      if (!error && data) setDocs(data);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <p className="p-6">Laster ESG-data...</p>;

  // KPI calculations
  const totalCo2 = docs.reduce((sum, d) => sum + (d.co2_kg ?? 0), 0);
  const totalCost = docs.reduce((sum, d) => sum + (d.total_amount ?? 0), 0);
  const invoiceCount = docs.length;

  // Pie chart: CO₂ per supplier
  const pieData = Object.values(
    docs.reduce((acc: any, d) => {
      if (!d.supplier) return acc;
      if (!acc[d.supplier]) acc[d.supplier] = { name: d.supplier, value: 0 };
      acc[d.supplier].value += d.co2_kg ?? 0;
      return acc;
    }, {})
  );

  // Line chart: CO₂ over time
  const lineData = Object.values(
    docs.reduce((acc: any, d) => {
      if (!d.invoice_date) return acc;
      const month = d.invoice_date.slice(0, 7); // YYYY-MM
      if (!acc[month]) acc[month] = { month, co2: 0 };
      acc[month].co2 += d.co2_kg ?? 0;
      return acc;
    }, {})
  ).sort((a: any, b: any) => a.month.localeCompare(b.month));

  // Bar chart: COST per supplier
  const barData = Object.values(
    docs.reduce((acc: any, d) => {
      if (!d.supplier) return acc;
      if (!acc[d.supplier]) acc[d.supplier] = { name: d.supplier, cost: 0 };
      acc[d.supplier].cost += d.total_amount ?? 0;
      return acc;
    }, {})
  );

  const COLORS = ["#22C55E", "#0EA5E9", "#6366F1", "#F59E0B", "#EF4444"];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 space-y-10">

      {/* KPI CARDS */}
      <h1 className="text-3xl font-semibold mb-4">ESG Oversikt</h1>
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

      {/* CO₂ PER SUPPLIER */}
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
                {pieData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* CO₂ OVER TIME */}
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

      {/* COST PER SUPPLIER */}
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

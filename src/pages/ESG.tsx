// src/pages/ESG.tsx
import { useEffect, useState, useMemo } from "react";
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
import { createESGReport, SupplierBreakdown } from "../lib/createESGReport";

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
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("document")
        .select("id, supplier_name, total_amount, co2_kg, invoice_date, org_id")
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

  const totalCo2 = docs.reduce((sum, d) => sum + (d.co2_kg ?? 0), 0);
  const totalCost = docs.reduce((sum, d) => sum + (d.total_amount ?? 0), 0);
  const invoiceCount = docs.length;

  // Aggregert per leverandør – både kost og CO2 (brukes både i grafer og rapport)
  const supplierAgg: SupplierBreakdown[] = useMemo(
    () =>
      Object.values(
        docs.reduce(
          (acc: Record<string, SupplierBreakdown>, d) => {
            if (!d.supplier_name) return acc;
            const name = d.supplier_name;
            if (!acc[name]) {
              acc[name] = { name, cost: 0, co2: 0 };
            }
            acc[name].cost += d.total_amount ?? 0;
            acc[name].co2 += d.co2_kg ?? 0;
            return acc;
          },
          {} as Record<string, SupplierBreakdown>
        )
      ).sort((a, b) => b.co2 - a.co2),
    [docs]
  );

  const pieData = supplierAgg.map((s) => ({
    name: s.name,
    value: s.co2,
  }));

  const barData = supplierAgg.map((s) => ({
    name: s.name,
    cost: s.cost,
  }));

  const lineData = useMemo(
    () =>
      Object.values(
        docs.reduce((acc: any, d) => {
          if (!d.invoice_date) return acc;
          const month = d.invoice_date.slice(0, 7);
          if (!acc[month]) acc[month] = { month, co2: 0 };
          acc[month].co2 += d.co2_kg ?? 0;
          return acc;
        }, {} as Record<string, { month: string; co2: number }>)
      ).sort((a: any, b: any) => a.month.localeCompare(b.month)),
    [docs]
  );

  const COLORS = ["#22C55E", "#0EA5E9", "#6366F1", "#F59E0B", "#EF4444"];

  async function handleDownloadReport() {
    try {
      setDownloading(true);

      const periodLabel =
        docs.length === 0
          ? "Ingen data"
          : `${docs
              .map((d) => d.invoice_date)
              .filter(Boolean)
              .sort()[0]
              ?.slice(0, 7)} – ${
              docs
                .map((d) => d.invoice_date)
                .filter(Boolean)
                .sort()
                .slice(-1)[0]
                ?.slice(0, 7)
            }`;

      createESGReport({
        orgName: "Demo Org",
        periodLabel,
        generatedAt: new Date(),
        totalCo2,
        totalCost,
        invoiceCount,
        suppliers: supplierAgg.slice(0, 10), // topp 10 i rapporten
      });
    } finally {
      setDownloading(false);
    }
  }

  if (loading) return <p className="p-6">Laster ESG-data…</p>;
  if (error)
    return (
      <div className="p-6 text-red-700 bg-red-50 border border-red-200 rounded">
        {error}
      </div>
    );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 space-y-10">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-3xl font-semibold">ESG Oversikt</h1>
          <p className="text-sm text-slate-500">
            Basert på fakturaer registrert på Demo Org.
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <span className="text-xs text-slate-500">
            Org: Demo Org ({ACTIVE_ORG_ID.slice(0, 8)}…)
          </span>
          <button
            onClick={handleDownloadReport}
            disabled={downloading || docs.length === 0}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white disabled:opacity-50 hover:bg-green-700"
          >
            {downloading ? "Genererer rapport…" : "Last ned ESG-rapport (PDF)"}
          </button>
          {docs.length === 0 && (
            <span className="text-[10px] text-slate-400">
              Last opp fakturaer først for å generere rapport.
            </span>
          )}
        </div>
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
                {pieData.map((_, i) => (
                  <Cell key={

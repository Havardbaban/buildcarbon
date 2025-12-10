import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

type MonthlyData = {
  month: string;
  total_amount: number;
  total_co2_kg: number;
  invoice_count: number;
};

type EmissionsData = {
  month: string;
  scope_name: string;
  total_co2_kg: number;
  total_cost: number;
};

type ESGMetrics = {
  scope1_co2: number;
  scope2_co2: number;
  scope3_co2: number;
  total_co2: number;
  total_spend: number;
  invoice_count: number;
  co2_per_1000_nok: number;
  esg_score: number;
};

type CostSaving = {
  category: string;
  esg_scope: number;
  occurrence_count: number;
  total_cost: number;
  total_co2_kg: number;
  recommendation: string;
  potential_co2_reduction_kg: number;
  potential_cost_savings_nok: number;
};

const SCOPE_COLORS = ["#ef4444", "#f59e0b", "#3b82f6"];
const CHART_COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b"];

export default function DashboardPage() {
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [emissionsData, setEmissionsData] = useState<EmissionsData[]>([]);
  const [esgMetrics, setESGMetrics] = useState<ESGMetrics | null>(null);
  const [costSavings, setCostSavings] = useState<CostSaving[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadDashboardData() {
    try {
      setLoading(true);

      const [monthlyRes, emissionsRes, esgRes, savingsRes] = await Promise.all([
        supabase
          .from("monthly_financials")
          .select("month, total_amount, total_co2_kg, invoice_count")
          .order("month", { ascending: true }),
        supabase
          .from("monthly_emissions")
          .select("month, scope_name, total_co2_kg, total_cost")
          .order("month", { ascending: true }),
        supabase.from("esg_metrics").select("*").single(),
        supabase
          .from("cost_savings_opportunities")
          .select("*")
          .order("potential_co2_reduction_kg", { ascending: false })
          .limit(5),
      ]);

      if (monthlyRes.data) {
        const aggregated = aggregateMonthlyData(monthlyRes.data);
        setMonthlyData(aggregated);
      }

      if (emissionsRes.data) {
        setEmissionsData(emissionsRes.data);
      }

      if (esgRes.data) {
        setESGMetrics(esgRes.data);
      }

      if (savingsRes.data) {
        setCostSavings(savingsRes.data);
      }
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      setLoading(false);
    }
  }

  function aggregateMonthlyData(data: any[]): MonthlyData[] {
    const map: Record<string, MonthlyData> = {};

    data.forEach((row) => {
      const month = row.month;
      if (!map[month]) {
        map[month] = {
          month: new Date(month).toLocaleDateString("nb-NO", {
            year: "numeric",
            month: "short",
          }),
          total_amount: 0,
          total_co2_kg: 0,
          invoice_count: 0,
        };
      }

      map[month].total_amount += Number(row.total_amount || 0);
      map[month].total_co2_kg += Number(row.total_co2_kg || 0);
      map[month].invoice_count = Math.max(
        map[month].invoice_count,
        Number(row.invoice_count || 0)
      );
    });

    return Object.values(map);
  }

  useEffect(() => {
    loadDashboardData();

    const channel = supabase
      .channel("dashboard-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices" },
        () => {
          loadDashboardData();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoice_lines" },
        () => {
          loadDashboardData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading && !esgMetrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Loading dashboard...</div>
      </div>
    );
  }

  const scopeData = esgMetrics
    ? [
        { name: "Scope 1: Direct", value: Number(esgMetrics.scope1_co2 || 0) },
        { name: "Scope 2: Energy", value: Number(esgMetrics.scope2_co2 || 0) },
        { name: "Scope 3: Value Chain", value: Number(esgMetrics.scope3_co2 || 0) },
      ].filter((item) => item.value > 0)
    : [];

  return (
    <div className="space-y-6 pb-12">
      <header className="border-b border-slate-200 pb-4">
        <h1 className="text-3xl font-bold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-slate-600">
          Real-time financial and environmental insights
        </p>
      </header>

      {esgMetrics && (
        <div className="grid gap-4 md:grid-cols-4">
          <KPICard
            label="ESG Score"
            value={Math.round(esgMetrics.esg_score)}
            unit="/100"
            color={getScoreColor(esgMetrics.esg_score)}
            subtitle="Environmental Performance"
          />
          <KPICard
            label="Total CO₂"
            value={Math.round(esgMetrics.total_co2).toLocaleString("nb-NO")}
            unit="kg"
            subtitle="Last 30 days"
          />
          <KPICard
            label="Total Spend"
            value={Math.round(esgMetrics.total_spend).toLocaleString("nb-NO")}
            unit="NOK"
            subtitle="Last 30 days"
          />
          <KPICard
            label="CO₂ Intensity"
            value={esgMetrics.co2_per_1000_nok.toFixed(1)}
            unit="kg/1000 NOK"
            subtitle="Emissions per spending"
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Monthly Spending & Emissions
          </h2>
          {monthlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" stroke="#64748b" style={{ fontSize: "12px" }} />
                <YAxis yAxisId="left" stroke="#10b981" style={{ fontSize: "12px" }} />
                <YAxis yAxisId="right" orientation="right" stroke="#3b82f6" style={{ fontSize: "12px" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #e2e8f0",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="total_amount"
                  stroke="#10b981"
                  strokeWidth={2}
                  name="Spending (NOK)"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="total_co2_kg"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  name="CO₂ (kg)"
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[300px] items-center justify-center text-slate-400">
              No monthly data yet. Upload invoices to see trends.
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">
            Emissions by ESG Scope
          </h2>
          {scopeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={scopeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${Math.round(entry.value)} kg`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {scopeData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={SCOPE_COLORS[index % SCOPE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[300px] items-center justify-center text-slate-400">
              No emissions data yet. Upload invoices to track ESG scopes.
            </div>
          )}
        </div>
      </div>

      {costSavings.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">
              Cost & Emission Savings Opportunities
            </h2>
            <button
              onClick={() => downloadCarbonReport(esgMetrics, costSavings, monthlyData)}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
            >
              Download Carbon Report
            </button>
          </div>

          <div className="space-y-3">
            {costSavings.map((saving, idx) => (
              <div
                key={idx}
                className="rounded-xl border border-slate-100 bg-slate-50 p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-slate-900">
                        {formatCategory(saving.category)}
                      </h3>
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium">
                        Scope {saving.esg_scope}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {saving.recommendation}
                    </p>
                    <div className="mt-2 flex gap-4 text-xs text-slate-500">
                      <span>
                        Current: {Math.round(saving.total_co2_kg)} kg CO₂,{" "}
                        {Math.round(saving.total_cost).toLocaleString("nb-NO")} NOK
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-emerald-600">
                      Save {Math.round(saving.potential_co2_reduction_kg)} kg CO₂
                    </div>
                    <div className="text-sm font-semibold text-blue-600">
                      Save {Math.round(saving.potential_cost_savings_nok).toLocaleString("nb-NO")} NOK
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function KPICard({
  label,
  value,
  unit,
  subtitle,
  color,
}: {
  label: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <div className={`text-3xl font-bold ${color || "text-slate-900"}`}>
          {value}
        </div>
        {unit && <div className="text-lg text-slate-500">{unit}</div>}
      </div>
      {subtitle && <div className="mt-1 text-xs text-slate-500">{subtitle}</div>}
    </div>
  );
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-blue-600";
  if (score >= 40) return "text-amber-600";
  return "text-red-600";
}

function formatCategory(category: string): string {
  const map: Record<string, string> = {
    fuel_diesel: "Diesel Fuel",
    fuel_petrol: "Petrol/Gasoline",
    fuel_gas: "Natural Gas",
    electricity: "Electricity",
    heating: "District Heating",
    cooling: "District Cooling",
    travel_flight: "Air Travel",
    travel_train: "Train Travel",
    travel_taxi: "Taxi/Rideshare",
    travel_hotel: "Hotel Accommodation",
    waste: "Waste Disposal",
    goods: "Purchased Goods",
    electronics: "Electronics",
    food: "Food & Catering",
    transport: "Transportation & Logistics",
  };
  return map[category] || category;
}

function downloadCarbonReport(
  esgMetrics: ESGMetrics | null,
  costSavings: CostSaving[],
  monthlyData: MonthlyData[]
) {
  const reportDate = new Date().toLocaleDateString("nb-NO");

  let content = `CARBON EMISSIONS REPORT
Generated: ${reportDate}

================================================================================
EXECUTIVE SUMMARY
================================================================================

ESG Environmental Score: ${esgMetrics ? Math.round(esgMetrics.esg_score) : 0}/100
Total CO₂ Emissions (30 days): ${esgMetrics ? Math.round(esgMetrics.total_co2).toLocaleString("nb-NO") : 0} kg
Total Spending (30 days): ${esgMetrics ? Math.round(esgMetrics.total_spend).toLocaleString("nb-NO") : 0} NOK
CO₂ Intensity: ${esgMetrics ? esgMetrics.co2_per_1000_nok.toFixed(2) : 0} kg CO₂ per 1000 NOK

================================================================================
EMISSIONS BY ESG SCOPE
================================================================================

Scope 1 (Direct Emissions): ${esgMetrics ? Math.round(esgMetrics.scope1_co2).toLocaleString("nb-NO") : 0} kg CO₂
Scope 2 (Purchased Energy): ${esgMetrics ? Math.round(esgMetrics.scope2_co2).toLocaleString("nb-NO") : 0} kg CO₂
Scope 3 (Value Chain): ${esgMetrics ? Math.round(esgMetrics.scope3_co2).toLocaleString("nb-NO") : 0} kg CO₂

================================================================================
MONTHLY TRENDS
================================================================================

${monthlyData
  .map(
    (m) =>
      `${m.month}: ${Math.round(m.total_amount).toLocaleString("nb-NO")} NOK, ${Math.round(m.total_co2_kg).toLocaleString("nb-NO")} kg CO₂`
  )
  .join("\n")}

================================================================================
COST & EMISSION REDUCTION OPPORTUNITIES
================================================================================

${costSavings
  .map(
    (s, idx) =>
      `${idx + 1}. ${formatCategory(s.category)} (Scope ${s.esg_scope})
   Current: ${Math.round(s.total_co2_kg)} kg CO₂, ${Math.round(s.total_cost).toLocaleString("nb-NO")} NOK
   Recommendation: ${s.recommendation}
   Potential Savings: ${Math.round(s.potential_co2_reduction_kg)} kg CO₂, ${Math.round(s.potential_cost_savings_nok).toLocaleString("nb-NO")} NOK
`
  )
  .join("\n")}

================================================================================
METHODOLOGY
================================================================================

This report uses the GHG Protocol Corporate Accounting and Reporting Standard
for categorizing emissions into Scope 1, 2, and 3. Emission factors are based
on industry-standard datasets and local grid intensities.

ESG Score Calculation:
- Based on CO₂ intensity (kg CO₂ per 1000 NOK spending)
- Target benchmark: 50 kg CO₂ per 1000 NOK
- Score ranges from 0 (poor) to 100 (excellent)

Report generated by BuildCarbon Platform
`;

  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `carbon-report-${new Date().toISOString().split("T")[0]}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

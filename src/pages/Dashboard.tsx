// src/pages/Dashboard.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { ACTIVE_ORG_ID } from "../lib/org";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

type InvoiceRow = {
  id: string;
  org_id: string;
  invoice_date: string | null;
  amount_nok: number | null;
  total_co2_kg: number | null;
};

type MonthlyPoint = {
  monthLabel: string; // "2025-01"
  spend: number;
  co2: number;
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [monthly, setMonthly] = useState<MonthlyPoint[]>([]);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!isMounted) return;

      setLoading(true);
      const { data, error } = await supabase
        .from("invoices")
        .select("id, org_id, invoice_date, amount_nok, total_co2_kg")
        .eq("org_id", ACTIVE_ORG_ID)
        .not("invoice_date", "is", null);

      if (error) {
        console.error(error);
        if (!isMounted) return;
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as InvoiceRow[];

      const map = new Map<string, { spend: number; co2: number }>();

      for (const row of rows) {
        if (!row.invoice_date) continue;
        const date = new Date(row.invoice_date);
        const key = `${date.getFullYear()}-${String(
          date.getMonth() + 1
        ).padStart(2, "0")}`;

        const entry = map.get(key) ?? { spend: 0, co2: 0 };
        entry.spend += row.amount_nok ?? 0;
        entry.co2 += row.total_co2_kg ?? 0;
        map.set(key, entry);
      }

      const points: MonthlyPoint[] = Array.from(map.entries())
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([monthLabel, v]) => ({
          monthLabel,
          spend: Math.round(v.spend),
          co2: Math.round(v.co2 * 10) / 10,
        }));

      if (!isMounted) return;
      setMonthly(points);
      setLoading(false);
    }

    // Initial load
    load();

    // Realtime subscription – oppdater månedsgrafen ved INSERT/UPDATE/DELETE
    const channel = supabase
      .channel(`invoices-realtime-dashboard-monthly-${ACTIVE_ORG_ID}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "invoices",
          filter: `org_id=eq.${ACTIVE_ORG_ID}`,
        },
        () => {
          // Når noe skjer med invoices → bygg monthly-data på nytt
          load();
        }
      )
      .subscribe((status) => {
        console.log("Dashboard monthly realtime status:", status);
      });

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const hasData = monthly.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-sm text-gray-500">
          Real-time financial and environmental insights based on dine fakturaer.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-lg font-semibold">
            Monthly Spending &amp; Emissions
          </h2>
          {!hasData && !loading && (
            <p className="text-sm text-gray-500">
              No monthly data yet. Upload invoices to see trends.
            </p>
          )}
          {loading && (
            <p className="text-sm text-gray-400">Loading…</p>
          )}
          {hasData && (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="monthLabel" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="spend" name="Spend (NOK)" />
                  <Bar dataKey="co2" name="CO₂ (kg)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-lg font-semibold">
            Emissions by ESG Scope (last 12 months)
          </h2>
          <ScopeSummary />
        </div>
      </div>
    </div>
  );
}

function ScopeSummary() {
  const [data, setData] = useState<
    { scope: string; co2: number; spend: number }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      if (!isMounted) return;

      setLoading(true);
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

      const { data, error } = await supabase
        .from("invoices")
        .select("scope, total_co2_kg, amount_nok, org_id, invoice_date")
        .eq("org_id", ACTIVE_ORG_ID)
        .gte("invoice_date", oneYearAgo.toISOString().slice(0, 10));

      if (error) {
        console.error(error);
        if (!isMounted) return;
        setLoading(false);
        return;
      }

      const map = new Map<string, { co2: number; spend: number }>();

      for (const row of data ?? []) {
        const scope = (row as any).scope ?? "Unknown";
        const entry = map.get(scope) ?? { co2: 0, spend: 0 };
        entry.co2 += (row as any).total_co2_kg ?? 0;
        entry.spend += (row as any).amount_nok ?? 0;
        map.set(scope, entry);
      }

      const result = Array.from(map.entries()).map(([scope, v]) => ({
        scope,
        co2: Math.round((v.co2 || 0) * 10) / 10,
        spend: Math.round(v.spend || 0),
      }));

      if (!isMounted) return;
      setData(result);
      setLoading(false);
    }

    // Initial load
    load();

    // Realtime subscription – oppdater scope-sammendraget også
    const channel = supabase
      .channel(`invoices-realtime-dashboard-scope-${ACTIVE_ORG_ID}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "invoices",
          filter: `org_id=eq.${ACTIVE_ORG_ID}`,
        },
        () => {
          // Alle endringer i invoices siste 12 mnd → beregn på nytt
          load();
        }
      )
      .subscribe((status) => {
        console.log("Dashboard scope realtime status:", status);
      });

  return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  if (loading) return <p className="text-sm text-gray-400">Loading…</p>;
  if (!data.length)
    return (
      <p className="text-sm text-gray-500">
        No emissions data yet. Upload invoices to track ESG scopes.
      </p>
    );

  const totalCo2 = data.reduce((sum, d) => sum + d.co2, 0);

  return (
    <div className="space-y-2 text-sm">
      <table className="w-full text-left text-xs md:text-sm">
        <thead className="border-b text-gray-500">
          <tr>
            <th className="py-1 pr-2">Scope</th>
            <th className="py-1 pr-2 text-right">CO₂ (kg)</th>
            <th className="py-1 pr-2 text-right">% of total</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => {
            const share = totalCo2 ? (row.co2 / totalCo2) * 100 : 0;
            return (
              <tr key={row.scope} className="border-b last:border-0">
                <td className="py-1 pr-2">{row.scope}</td>
                <td className="py-1 pr-2 text-right">
                  {row.co2.toLocaleString("nb-NO")} kg
                </td>
                <td className="py-1 pr-2 text-right">
                  {share.toFixed(1)} %
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

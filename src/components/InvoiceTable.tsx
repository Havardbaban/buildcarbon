// src/components/InvoiceTable.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

// ---- Types ----------------------------------------------------
type Invoice = {
  id: string;
  created_at: string | null;
  date: string | null;
  vendor: string | null;
  invoice_number: string | null;
  filename: string | null;
  status: string | null;
  currency: string | null;
  total: number | null;

  // NEW: activity + emissions
  co2_kg: number | null;
  energy_kwh: number | null;
  fuel_liters: number | null;
  gas_m3: number | null;
};

// ---- Format helpers -------------------------------------------
const fmtInt = (n: number | null | undefined) =>
  n == null ? "–" : new Intl.NumberFormat("no-NO", { maximumFractionDigits: 0 }).format(n);

const fmtFloat = (n: number | null | undefined, digits = 2) =>
  n == null ? "–" : new Intl.NumberFormat("no-NO", { maximumFractionDigits: digits }).format(n);

const fmtDate = (iso: string | null) => (iso ? iso : "–");

// ---- Component ------------------------------------------------
export default function InvoiceTable({ refreshKey }: { refreshKey?: string }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch from Supabase
  async function fetchInvoices() {
    setLoading(true);
    const { data, error } = await supabase
      .from("invoices")
      .select(
        [
          "id",
          "created_at",
          "date",
          "vendor",
          "invoice_number",
          "filename",
          "status",
          "currency",
          "total",
          // NEW fields
          "co2_kg",
          "energy_kwh",
          "fuel_liters",
          "gas_m3",
        ].join(",")
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setInvoices([]);
    } else {
      setInvoices((data ?? []) as Invoice[]);
    }
    setLoading(false);
  }

  // Initial + on refreshKey changes
  useEffect(() => {
    fetchInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Realtime: refresh when table changes
  useEffect(() => {
    const channel = supabase
      .channel("invoices-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices" },
        () => fetchInvoices()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Totals
  const sum = <K extends keyof Invoice>(key: K, digits = 0) => {
    const total = invoices.reduce((acc, r) => {
      const v = r[key];
      if (typeof v === "number" && Number.isFinite(v)) return acc + (v as number);
      return acc;
    }, 0);
    return digits === 0 ? fmtInt(total) : fmtFloat(total, digits);
  };

  return (
    <table className="w-full text-sm text-left border-collapse">
      <thead>
        <tr className="text-left text-slate-600 border-b">
          <th className="px-2 py-2">Date</th>
          <th className="px-2 py-2">Vendor</th>
          <th className="px-2 py-2">Total (NOK)</th>
          <th className="px-2 py-2">CO₂ (kg)</th>
          <th className="px-2 py-2">Energy (kWh)</th>
          <th className="px-2 py-2">Fuel (L)</th>
          <th className="px-2 py-2">Gas (m³)</th>
          <th className="px-2 py-2">Status</th>
          <th className="px-2 py-2">File</th>
        </tr>
      </thead>

      <tbody>
        {loading && (
          <tr>
            <td className="px-2 py-3 text-slate-500" colSpan={9}>
              Loading…
            </td>
          </tr>
        )}

        {!loading && invoices.length === 0 && (
          <tr>
            <td className="px-2 py-3 text-slate-500" colSpan={9}>
              No invoices yet.
            </td>
          </tr>
        )}

        {invoices.map((row) => (
          <tr key={row.id} className="border-b">
            <td className="px-2 py-2">{fmtDate(row.date)}</td>
            <td className="px-2 py-2">{row.vendor ?? "–"}</td>
            <td className="px-2 py-2">{fmtInt(row.total)}</td>
            <td className="px-2 py-2">{fmtFloat(row.co2_kg)}</td>
            <td className="px-2 py-2">{fmtFloat(row.energy_kwh)}</td>
            <td className="px-2 py-2">{fmtFloat(row.fuel_liters)}</td>
            <td className="px-2 py-2">{fmtFloat(row.gas_m3)}</td>
            <td className="px-2 py-2">{row.status ?? "–"}</td>
            <td className="px-2 py-2">{row.filename ?? "–"}</td>
          </tr>
        ))}
      </tbody>

      {invoices.length > 0 && (
        <tfoot>
          <tr className="border-t font-semibold bg-slate-50">
            <td className="px-2 py-2" colSpan={2}>
              Totals
            </td>
            <td className="px-2 py-2">{sum("total")}</td>
            <td className="px-2 py-2">{sum("co2_kg", 2)}</td>
            <td className="px-2 py-2">{sum("energy_kwh", 2)}</td>
            <td className="px-2 py-2">{sum("fuel_liters", 2)}</td>
            <td className="px-2 py-2">{sum("gas_m3", 2)}</td>
            <td className="px-2 py-2" colSpan={2}></td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}

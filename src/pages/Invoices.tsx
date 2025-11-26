import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { ACTIVE_ORG_ID } from "../lib/org";

type DocumentRow = {
  id: string;
  org_id: string | null;
  supplier_name: string | null;
  supplier_orgnr: string | null;
  issue_date: string | null;
  total_amount: number | null;
  currency: string | null;
  co2_kg: number | null;
};

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("nb-NO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("nb-NO");
}

export default function Invoices() {
  const [rows, setRows] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("document")
        .select(
          `
          id,
          org_id,
          supplier_name,
          supplier_orgnr,
          issue_date,
          total_amount,
          currency,
          co2_kg
        `
        )
        .eq("org_id", ACTIVE_ORG_ID)
        .order("issue_date", { ascending: false });

      if (error) {
        console.error(error);
        setError("Kunne ikke hente fakturaer.");
      } else if (data) {
        setRows(data as DocumentRow[]);
      }

      setLoading(false);
    }

    load();
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Fakturaer</h1>
        <span className="text-xs text-slate-500">
          Org: Demo Org ({ACTIVE_ORG_ID.slice(0, 8)}…)
        </span>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p>Laster fakturaer…</p>
      ) : rows.length === 0 ? (
        <p>Ingen fakturaer funnet for denne organisasjonen.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Leverandør</th>
                <th className="px-3 py-2">Org.nr</th>
                <th className="px-3 py-2">Dato</th>
                <th className="px-3 py-2">Beløp</th>
                <th className="px-3 py-2">CO₂ (kg)</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b last:border-0 hover:bg-slate-50 cursor-pointer"
                  onClick={() => navigate(`/invoice/${row.id}`)}
                >
                  <td className="px-3 py-2">{row.supplier_name ?? "Ukjent"}</td>
                  <td className="px-3 py-2">{row.supplier_orgnr ?? "-"}</td>
                  <td className="px-3 py-2">{formatDate(row.issue_date)}</td>
                  <td className="px-3 py-2">
                    {formatNumber(row.total_amount)} {row.currency ?? "NOK"}
                  </td>
                  <td className="px-3 py-2">
                    {row.co2_kg !== null && row.co2_kg !== undefined
                      ? row.co2_kg.toFixed(1)
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

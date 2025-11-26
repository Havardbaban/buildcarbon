// src/pages/Documents.tsx
import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { ACTIVE_ORG_ID } from "../lib/org";

type DocRow = {
  id: string;
  supplier_name: string | null;
  issue_date: string | null;
  total_amount: number | null;
  currency: string | null;
  co2_kg: number | null;
  file_path: string | null;
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

export default function DocumentsPage() {
  const [rows, setRows] = useState<DocRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from("document")
        .select(
          `
          id,
          supplier_name,
          issue_date,
          total_amount,
          currency,
          co2_kg,
          file_path,
          org_id
        `
        )
        .eq("org_id", ACTIVE_ORG_ID)
        .order("issue_date", { ascending: false });

      if (error) {
        console.error(error);
        setError("Kunne ikke hente dokumenter.");
      } else if (data) {
        setRows(data as DocRow[]);
      }

      setLoading(false);
    }

    load();
  }, []);

  const rowsWithUrl = useMemo(
    () =>
      rows.map((row) => {
        const url =
          row.file_path && row.file_path.length > 0
            ? supabase.storage
                .from("invoices")
                .getPublicUrl(row.file_path).data.publicUrl
            : null;

        return { ...row, url };
      }),
    [rows]
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dokumenter</h1>
        <span className="text-xs text-slate-500">
          Org: Demo Org ({ACTIVE_ORG_ID.slice(0, 8)}…)
        </span>
      </div>

      <p className="text-sm text-slate-600">
        Dette er faktura-dokumentene som brukes i ESG- og CO₂-beregningene. Du
        kan laste ned PDF-ene som dokumentasjon til bank, styre eller revisjon.
      </p>

      {error && (
        <div className="rounded border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <p>Laster dokumenter…</p>
      ) : rowsWithUrl.length === 0 ? (
        <p>Ingen dokumenter funnet for denne organisasjonen.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Dato</th>
                <th className="px-3 py-2">Leverandør</th>
                <th className="px-3 py-2">Beløp</th>
                <th className="px-3 py-2">CO₂ (kg)</th>
                <th className="px-3 py-2">Fil</th>
              </tr>
            </thead>
            <tbody>
              {rowsWithUrl.map((row) => (
                <tr key={row.id} className="border-b last:border-0">
                  <td className="px-3 py-2">{formatDate(row.issue_date)}</td>
                  <td className="px-3 py-2">
                    {row.supplier_name ?? "Ukjent leverandør"}
                  </td>
                  <td className="px-3 py-2">
                    {formatNumber(row.total_amount)}{" "}
                    {row.currency ?? "NOK"}
                  </td>
                  <td className="px-3 py-2">
                    {row.co2_kg !== null && row.co2_kg !== undefined
                      ? row.co2_kg.toFixed(1)
                      : "-"}
                  </td>
                  <td className="px-3 py-2">
                    {row.url ? (
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Åpne PDF
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">
                        Ingen filbane
                      </span>
                    )}
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

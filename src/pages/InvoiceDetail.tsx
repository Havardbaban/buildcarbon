import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import supabase from "../lib/supabase";

type DocumentRow = {
  id: string;
  org_id: string;
  issue_date: string | null;
  total_amount: number | null;
  currency: string | null;
  co2_kg: number | null;
  fuel_liters: number | null;
};

type DocumentLine = {
  id: string;
  document_id: string;
  description: string | null;
  quantity: number | null;
  amount: number | null;
  co2_kg: number | null;
  fuel_liters: number | null;
};

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState<DocumentRow | null>(null);
  const [lines, setLines] = useState<DocumentLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      // 1) Fetch the invoice (from "document" table)
      const { data: invoiceData, error: invoiceError } = await supabase
        .from("document")
        .select("*")
        .eq("id", id)
        .single();

      if (invoiceError || !invoiceData) {
        setError("Kunne ikke finne fakturaen.");
        setLoading(false);
        return;
      }

      // 2) Fetch its line items (from "document_line" table)
      const { data: lineData, error: lineError } = await supabase
        .from("document_line")
        .select("*")
        .eq("document_id", id)
        .order("id", { ascending: true });

      if (lineError) {
        setError("Kunne ikke hente linjene til fakturaen.");
      }

      setInvoice(invoiceData as DocumentRow);
      setLines((lineData || []) as DocumentLine[]);
      setLoading(false);
    };

    fetchData();
  }, [id]);

  const formatAmount = (v: number | null | undefined) =>
    v == null ? "—" : v.toLocaleString("nb-NO", { maximumFractionDigits: 0 });

  const formatCO2 = (v: number | null | undefined) =>
    v == null ? "—" : v.toLocaleString("nb-NO", { maximumFractionDigits: 1 });

  const formatDate = (value: string | null) => {
    if (!value) return "—";
    const d = new Date(value);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("nb-NO");
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 p-6">
        <p>Laster faktura…</p>
      </main>
    );
  }

  if (error || !invoice) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 p-6 space-y-4">
        <button
          onClick={() => navigate(-1)}
          className="text-sm underline text-slate-300"
        >
          ← Tilbake
        </button>
        <p className="text-red-400">{error ?? "Fant ikke fakturaen."}</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-5xl p-6 space-y-6">
        {/* header */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <button
              onClick={() => navigate(-1)}
              className="text-sm text-slate-400 hover:text-slate-200 underline"
            >
              ← Tilbake til fakturaliste
            </button>
            <h1 className="text-2xl font-semibold">Faktura detalj</h1>
            <p className="text-sm text-slate-400">
              ID: <span className="font-mono text-xs">{invoice.id}</span>
            </p>
          </div>
          <div className="text-right text-sm text-slate-400">
            <p>Dato: {formatDate(invoice.issue_date)}</p>
          </div>
        </div>

        {/* summary cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-900/60 p-4 border border-slate-800">
            <p className="text-xs uppercase text-slate-400">Beløp</p>
            <p className="mt-2 text-xl font-semibold">
              {formatAmount(invoice.total_amount)} {invoice.currency ?? "NOK"}
            </p>
          </div>
          <div className="rounded-2xl bg-slate-900/60 p-4 border border-slate-800">
            <p className="text-xs uppercase text-slate-400">Total CO₂</p>
            <p className="mt-2 text-xl font-semibold">
              {formatCO2(invoice.co2_kg)} kg
            </p>
          </div>
          <div className="rounded-2xl bg-slate-900/60 p-4 border border-slate-800">
            <p className="text-xs uppercase text-slate-400">Fuel</p>
            <p className="mt-2 text-xl font-semibold">
              {formatAmount(invoice.fuel_liters)} L
            </p>
          </div>
        </div>

        {/* lines table */}
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-slate-200">
              Linjer ({lines.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900/80">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-400 uppercase">
                    Beskrivelse
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-400 uppercase">
                    Antall
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-400 uppercase">
                    Beløp
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-400 uppercase">
                    CO₂ (kg)
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-400 uppercase">
                    Fuel (L)
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-6 text-center text-sm text-slate-400"
                    >
                      Ingen linjer funnet for denne fakturaen.
                    </td>
                  </tr>
                )}
                {lines.map((line) => (
                  <tr
                    key={line.id}
                    className="border-t border-slate-800 hover:bg-slate-900/80"
                  >
                    <td className="px-4 py-2 align-top">
                      {line.description ?? "Ingen beskrivelse"}
                    </td>
                    <td className="px-4 py-2 align-top text-right">
                      {line.quantity ?? "—"}
                    </td>
                    <td className="px-4 py-2 align-top text-right">
                      {formatAmount(line.amount)}
                    </td>
                    <td className="px-4 py-2 align-top text-right">
                      {formatCO2(line.co2_kg)}
                    </td>
                    <td className="px-4 py-2 align-top text-right">
                      {formatAmount(line.fuel_liters)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

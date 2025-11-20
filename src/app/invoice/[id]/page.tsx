'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Invoice = {
  id: string;
  invoice_date: string | null;
  total: number | null;
  currency: string | null;
  total_co2_kg: number | null;
  fuel_liters: number | null;
};

type InvoiceLine = {
  id: string;
  invoice_id: string;
  description: string | null;
  quantity: number | null;
  amount: number | null;
  co2_kg: number | null;
  fuel_liters: number | null;
};

export default function InvoiceDetailPage() {
  const params = useParams() as { id: string };
  const router = useRouter();
  const invoiceId = params.id;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!invoiceId) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      // 1) Fetch invoice
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('invoices')
        .select('id, invoice_date, total, currency, total_co2_kg, fuel_liters')
        .eq('id', invoiceId)
        .single();

      if (invoiceError || !invoiceData) {
        setError('Kunne ikke finne fakturaen.');
        setLoading(false);
        return;
      }

      // 2) Fetch line items
      const { data: lineData, error: lineError } = await supabase
        .from('invoice_lines')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('id', { ascending: true });

      if (lineError) {
        setError('Kunne ikke hente linjene til fakturaen.');
      }

      setInvoice(invoiceData as Invoice);
      setLines((lineData || []) as InvoiceLine[]);
      setLoading(false);
    };

    fetchData();
  }, [invoiceId]);

  const formatAmount = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '—';
    return value.toLocaleString('nb-NO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    });
  };

  const formatCO2 = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '—';
    return value.toLocaleString('nb-NO', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  };

  const formatDate = (value: string | null) => {
    if (!value) return '—';
    const d = new Date(value);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('nb-NO');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 p-6">
        <p>Laster faktura…</p>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-50 p-6 space-y-4">
        <button
          onClick={() => router.back()}
          className="text-sm underline text-slate-300"
        >
          ← Tilbake
        </button>
        <p className="text-red-400">{error ?? 'Fant ikke fakturaen.'}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-5xl p-6 space-y-6">
        {/* Top header */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <button
              onClick={() => router.back()}
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
            <p>Dato: {formatDate(invoice.invoice_date)}</p>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-slate-900/60 p-4 border border-slate-800">
            <p className="text-xs uppercase text-slate-400">Amount</p>
            <p className="mt-2 text-xl font-semibold">
              {formatAmount(invoice.total)} {invoice.currency ?? 'NOK'}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-900/60 p-4 border border-slate-800">
            <p className="text-xs uppercase text-slate-400">Total CO₂</p>
            <p className="mt-2 text-xl font-semibold">
              {formatCO2(invoice.total_co2_kg)} kg
            </p>
          </div>

          <div className="rounded-2xl bg-slate-900/60 p-4 border border-slate-800">
            <p className="text-xs uppercase text-slate-400">Fuel</p>
            <p className="mt-2 text-xl font-semibold">
              {formatAmount(invoice.fuel_liters)} L
            </p>
          </div>
        </div>

        {/* Line items */}
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
                      {line.description ?? 'Ingen beskrivelse'}
                    </td>
                    <td className="px-4 py-2 align-top text-right">
                      {line.quantity ?? '—'}
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

        {/* Back link */}
        <div className="pt-2">
          <button
            onClick={() => router.push('/')}
            className="text-sm text-slate-400 hover:text-slate-100 underline"
          >
            ← Til dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

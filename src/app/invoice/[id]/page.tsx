'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient'; // adjust path if needed

type Invoice = {
  id: string;
  filename: string | null;
  vendor: string | null;
  invoice_no: string | null;
  invoice_date: string | null;
  total: number | null;
  currency: string | null;
  total_co2_kg: number | null;
  energy_kwh: number | null;
  fuel_type: string | null;
  status: string | null;
  created_at: string;
};

type InvoiceLine = {
  id: string;
  invoice_id: string;
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  category: string | null;
  co2_kg: number | null;
  energy_kwh: number | null;
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
        .select('*')
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
        setLoading(false);
        setInvoice(invoiceData as Invoice);
        return;
      }

      setInvoice(invoiceData as Invoice);
      setLines((lineData || []) as InvoiceLine[]);
      setLoading(false);
    };

    fetchData();
  }, [invoiceId]);

  if (loading) {
    return (
      <div className="p-6">
        <p>Laster faktura…</p>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="p-6 space-y-4">
        <button
          onClick={() => router.back()}
          className="text-sm underline"
        >
          ← Tilbake
        </button>
        <p className="text-red-600">{error ?? 'Fant ikke fakturaen.'}</p>
      </div>
    );
  }

  // Helper formatters
  const formatNumber = (value: number | null | undefined, decimals = 2) => {
    if (value === null || value === undefined) return '-';
    return value.toLocaleString('nb-NO', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  };

  const formatDate = (value: string | null) => {
    if (!value) return '-';
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString('nb-NO');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50">
      <div className="mx-auto max-w-5xl p-6 space-y-6">
        {/* Top nav / breadcrumb */}
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <button
              onClick={() => router.back()}
              className="text-sm text-slate-400 hover:text-slate-200 underline"
            >
              ← Tilbake til fakturaliste
            </button>
            <h1 className="text-2xl font-semibold">
              Faktura detalj
            </h1>
            <p className="text-sm text-slate-400">
              {invoice.vendor ?? 'Ukjent leverandør'} •{' '}
              {invoice.invoice_no ? `Faktura #${invoice.invoice_no}` : invoice.filename}
            </p>
          </div>

          <div className="text-right text-sm text-slate-400">
            {invoice.status && (
              <p>
                Status:{' '}
                <span className="inline-flex rounded-full bg-slate-800 px-3 py-1 text-xs uppercase tracking-wide">
                  {invoice.status}
                </span>
              </p>
            )}
            <p>Opprettet: {formatDate(invoice.created_at)}</p>
          </div>
        </div>

        {/* Invoice meta cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl bg-slate-900/60 p-4 border border-slate-800">
            <p className="text-xs uppercase text-slate-400">Totalbeløp</p>
            <p className="mt-2 text-xl font-semibold">
              {formatNumber(invoice.total ?? 0)} {invoice.currency ?? 'NOK'}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-900/60 p-4 border border-slate-800">
            <p className="text-xs uppercase text-slate-400">Total CO₂</p>
            <p className="mt-2 text-xl font-semibold">
              {formatNumber(invoice.total_co2_kg ?? 0, 1)} kg
            </p>
          </div>

          <div className="rounded-2xl bg-slate-900/60 p-4 border border-slate-800">
            <p className="text-xs uppercase text-slate-400">Dato</p>
            <p className="mt-2 text-lg font-medium">
              {formatDate(invoice.invoice_date)}
            </p>
          </div>

          <div className="rounded-2xl bg-slate-900/60 p-4 border border-slate-800 space-y-1">
            <p className="text-xs uppercase text-slate-400">Energi & drivstoff</p>
            <p className="text-sm">
              {invoice.energy_kwh
                ? `${formatNumber(invoice.energy_kwh, 1)} kWh`
                : 'Ingen energi registrert'}
            </p>
            <p className="text-xs text-slate-400">
              Drivstoff: {invoice.fuel_type ?? '-'}
            </p>
          </div>
        </div>

        {/* Supplier / meta section */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-slate-900/60 p-4 border border-slate-800 space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">
              Leverandør
            </h2>
            <p className="text-sm text-slate-300">
              {invoice.vendor ?? 'Ukjent'}
            </p>
            {invoice.invoice_no && (
              <p className="text-xs text-slate-400">
                Fakturanummer: {invoice.invoice_no}
              </p>
            )}
            {invoice.filename && (
              <p className="text-xs text-slate-500">
                Filnavn: {invoice.filename}
              </p>
            )}
          </div>

          <div className="rounded-2xl bg-slate-900/60 p-4 border border-slate-800 space-y-2">
            <h2 className="text-sm font-semibold text-slate-200">
              CO₂-intensitet
            </h2>
            <p className="text-sm text-slate-300">
              {invoice.total && invoice.total_co2_kg
                ? `${formatNumber(
                    invoice.total_co2_kg / invoice.total,
                    3
                  )} kg CO₂ / kr`
                : 'Mangler data for å beregne CO₂-intensitet.'}
            </p>
          </div>
        </div>

        {/* Line items table */}
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <h2 className="text-sm font-semibold text-slate-200">
              Linjer ({lines.length})
            </h2>
            {/* Future: filters / category / etc */}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-900/80">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-400 uppercase">
                    Beskrivelse
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-400 uppercase">
                    Kategori
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-400 uppercase">
                    Antall
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-400 uppercase">
                    Enhetspris
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-400 uppercase">
                    Beløp
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-400 uppercase">
                    CO₂ (kg)
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-slate-400 uppercase">
                    Energi (kWh)
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
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
                      <p className="text-sm text-slate-100">
                        {line.description ?? 'Ingen beskrivelse'}
                      </p>
                    </td>
                    <td className="px-4 py-2 align-top text-right text-xs text-slate-400">
                      {line.category ?? '-'}
                    </td>
                    <td className="px-4 py-2 align-top text-right">
                      {line.quantity ?? '-'}
                    </td>
                    <td className="px-4 py-2 align-top text-right">
                      {line.unit_price !== null && line.unit_price !== undefined
                        ? formatNumber(line.unit_price)
                        : '-'}
                    </td>
                    <td className="px-4 py-2 align-top text-right">
                      {line.amount !== null && line.amount !== undefined
                        ? formatNumber(line.amount)
                        : '-'}
                    </td>
                    <td className="px-4 py-2 align-top text-right">
                      {line.co2_kg !== null && line.co2_kg !== undefined
                        ? formatNumber(line.co2_kg, 2)
                        : '-'}
                    </td>
                    <td className="px-4 py-2 align-top text-right">
                      {line.energy_kwh !== null && line.energy_kwh !== undefined
                        ? formatNumber(line.energy_kwh, 1)
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Optional: back to dashboard link */}
        <div className="pt-2">
          <Link
            href="/"
            className="text-sm text-slate-400 hover:text-slate-100 underline"
          >
            ← Til dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

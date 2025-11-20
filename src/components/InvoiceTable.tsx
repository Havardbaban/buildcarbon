'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type Invoice = {
  id: string;
  filename: string | null;
  vendor: string | null;
  invoice_no: string | null;
  invoice_date: string | null;
  total: number | null;
  currency: string | null;
  total_co2_kg: number | null;
};

export default function InvoiceTable() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('invoices')
        .select(
          'id, filename, vendor, invoice_no, invoice_date, total, currency, total_co2_kg'
        )
        .order('created_at', { ascending: false })
        .limit(100);

      if (!error && data) {
        setInvoices(data as Invoice[]);
      }
      setLoading(false);
    };

    load();
  }, []);

  const formatNumber = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '-';
    return value.toLocaleString('nb-NO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const formatDate = (value: string | null) => {
    if (!value) return '-';
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString('nb-NO');
  };

  return (
    <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <h2 className="text-sm font-semibold text-slate-200">
          Fakturaer
        </h2>
        <p className="text-xs text-slate-400">
          Klikk på en rad for å se detaljer
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-900/80">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-400 uppercase">
                Leverandør / Faktura
              </th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-400 uppercase">
                Dato
              </th>
              <th className="px-4 py-2 text-right text-xs font-semibold text-slate-400 uppercase">
                Beløp
              </th>
              <th className="px-4 py-2 text-right text-xs font-semibold text-slate-400 uppercase">
                CO₂ (kg)
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-6 text-center text-slate-400"
                >
                  Laster fakturaer…
                </td>
              </tr>
            )}

            {!loading && invoices.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-6 text-center text-slate-400"
                >
                  Ingen fakturaer funnet.
                </td>
              </tr>
            )}

            {invoices.map((invoice) => (
              <tr
                key={invoice.id}
                className="border-t border-slate-800 hover:bg-slate-900/80 cursor-pointer"
              >
                {/* Whole first cell is a link */}
                <td className="px-4 py-2">
                  <Link href={`/invoice/${invoice.id}`}>
                    <div className="space-y-1">
                      <p className="text-sm text-slate-100">
                        {invoice.vendor ?? 'Ukjent leverandør'}
                      </p>
                      <p className="text-xs text-slate-400">
                        {invoice.invoice_no
                          ? `Faktura #${invoice.invoice_no}`
                          : invoice.filename ?? 'Uten fakturanummer'}
                      </p>
                    </div>
                  </Link>
                </td>

                <td className="px-4 py-2 text-sm text-slate-200">
                  <Link href={`/invoice/${invoice.id}`}>
                    {formatDate(invoice.invoice_date)}
                  </Link>
                </td>

                <td className="px-4 py-2 text-right text-sm text-slate-200">
                  <Link href={`/invoice/${invoice.id}`}>
                    {formatNumber(invoice.total)} {invoice.currency ?? 'NOK'}
                  </Link>
                </td>

                <td className="px-4 py-2 text-right text-sm text-slate-200">
                  <Link href={`/invoice/${invoice.id}`}>
                    {formatNumber(invoice.total_co2_kg ?? 0)}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

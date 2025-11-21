import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

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

export default function InvoiceTable({ refresh }: { refresh?: number }) {
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
  }, [refresh]);

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
    <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <h2 className="text-sm font-semibold text-slate-900">
          Invoices
        </h2>
        <p className="text-xs text-slate-500">
          {invoices.length} invoices found
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase">
                Vendor / Invoice
              </th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase">
                Date
              </th>
              <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500 uppercase">
                Amount
              </th>
              <th className="px-4 py-2 text-right text-xs font-semibold text-slate-500 uppercase">
                CO₂ (kg)
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-6 text-center text-slate-500"
                >
                  Loading invoices…
                </td>
              </tr>
            )}

            {!loading && invoices.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-6 text-center text-slate-500"
                >
                  No invoices found. Upload one above to get started.
                </td>
              </tr>
            )}

            {invoices.map((invoice) => (
              <tr
                key={invoice.id}
                className="border-t border-slate-200 hover:bg-slate-50"
              >
                <td className="px-4 py-2">
                  <div className="space-y-1">
                    <p className="text-sm text-slate-900">
                      {invoice.vendor ?? 'Unknown vendor'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {invoice.invoice_no
                        ? `Invoice #${invoice.invoice_no}`
                        : invoice.filename ?? 'No invoice number'}
                    </p>
                  </div>
                </td>

                <td className="px-4 py-2 text-sm text-slate-700">
                  {formatDate(invoice.invoice_date)}
                </td>

                <td className="px-4 py-2 text-right text-sm text-slate-900">
                  {formatNumber(invoice.total)} {invoice.currency ?? 'NOK'}
                </td>

                <td className="px-4 py-2 text-right text-sm text-slate-900">
                  {formatNumber(invoice.total_co2_kg ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

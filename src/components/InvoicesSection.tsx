'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Invoice = {
  id: string;
  invoice_date: string | null;
  total: number | null;
  currency: string | null;
  total_co2_kg: number | null;
  fuel_liters: number | null;
};

export default function InvoicesSection() {
  const router = useRouter();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadInvoices = async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from('invoices')
        .select(
          'id, invoice_date, total, currency, total_co2_kg, fuel_liters'
        )
        .order('created_at', { ascending: false });

      if (!error && data) {
        setInvoices(data as Invoice[]);
      }

      setLoading(false);
    };

    loadInvoices();
  }, []);

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

  const invoiceCount = invoices.length;

  const totalAmount = invoices.reduce(
    (sum, inv) => sum + (inv.total ?? 0),
    0
  );

  const totalCO2 = invoices.reduce(
    (sum, inv) => sum + (inv.total_co2_kg ?? 0),
    0
  );

  const totalFuelLiters = invoices.reduce(
    (sum, inv) => sum + (inv.fuel_liters ?? 0),
    0
  );

  const currency = invoices[0]?.currency ?? 'NOK';

  return (
    <section className="w-full max-w-5xl mx-auto mt-10 space-y-6">
      <h2 className="text-3xl font-semibold tracking-tight">
        Invoices & CO₂
      </h2>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-slate-500">
            Invoices
          </p>
          <p className="mt-3 text-2xl font-semibold">{invoiceCount}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-slate-500">
            Total amount
          </p>
          <p className="mt-3 text-2xl font-semibold">
            {formatAmount(totalAmount)} {currency}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
          <p className="text-xs font-medium uppercase text-slate-500">
            Total CO₂
          </p>
          <p className="mt-3 text-2xl font-semibold">
            {formatCO2(totalCO2)} kg
          </p>
          <p className="mt-1 text-xs text-slate-500">
            From approx. {formatAmount(totalFuelLiters)} liters of fuel
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Invoice ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                Issue date
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                Amount (NOK)
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                CO₂ (kg)
              </th>
              <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                Fuel (liters)
              </th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-6 text-center text-slate-500"
                >
                  Loading invoices…
                </td>
              </tr>
            )}

            {!loading &&
              invoices.map((inv) => (
                <tr
                  key={inv.id}
                  onClick={() => router.push(`/invoice/${inv.id}`)}
                  className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                >
                  <td className="px-6 py-3 text-xs text-slate-600">
                    {inv.id}
                  </td>
                  <td className="px-6 py-3">
                    {formatDate(inv.invoice_date)}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {formatAmount(inv.total)}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {formatCO2(inv.total_co2_kg)}
                  </td>
                  <td className="px-6 py-3 text-right">
                    {formatAmount(inv.fuel_liters)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

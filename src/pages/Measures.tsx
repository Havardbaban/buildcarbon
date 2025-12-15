// src/pages/Measures.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { ACTIVE_ORG_ID } from "../lib/org";
import {
  DEFAULT_SCENARIOS,
  SHADOW_PRICE_PER_TONN_NOK,
  calculateShadowSavingsFromInvoices,
  calculateRealSavingsFromLines,
  fmtNok,
  fmtNumber,
  type InvoiceRow,
  type InvoiceLineRow,
} from "../lib/finance";

type VendorAgg = {
  vendor: string;
  totalSpendNok: number;
  totalCo2Kg: number;
  shadowCostNok: number;
  shadowSavingsByScenario: ReturnType<typeof calculateShadowSavingsFromInvoices>;
  realSavings: ReturnType<typeof calculateRealSavingsFromLines>;
};

export default function MeasuresPage() {
  const [vendors, setVendors] = useState<VendorAgg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      setLoading(true);

      // ✅ Viktig: hos deg heter beløpet amount_nok (ikke total)
      const { data: invData, error: invErr } = await supabase
        .from("invoices")
        .select("id, vendor, amount_nok, total_co2_kg")
        .eq("org_id", ACTIVE_ORG_ID);

      if (invErr) throw invErr;

      const invoices: InvoiceRow[] = (invData ?? []).map((r: any) => ({
        id: String(r.id),
        vendor: r.vendor ?? null,
        // vi mapper amount_nok -> total (fordi finance-funksjonene forventer "total")
        total: typeof r.amount_nok === "number" ? r.amount_nok : Number(r.amount_nok ?? 0),
        total_co2_kg:
          typeof r.total_co2_kg === "number" ? r.total_co2_kg : Number(r.total_co2_kg ?? 0),
      }));

      const invoiceVendor: Record<string, string> = {};
      for (const inv of invoices) {
        invoiceVendor[inv.id] = (inv.vendor ?? "Ukjent").trim() || "Ukjent";
      }

      // ✅ Hent invoice_lines, men kun kolonner vi vet vi har (fra migrasjonen)
      // Vi spør IKKE etter "total" på linjene (den kan være ulikt navn eller mangle)
      const { data: lineData, error: lineErr } = await supabase
        .from("invoice_lines")
        .select("invoice_id, category, quantity, unit, unit_price")
        .in(
          "invoice_id",
          invoices.map((i) => i.id)
        );

      // Hvis dere ikke har RLS/policy eller tabellen ikke finnes, ikke stopp hele siden
      if (lineErr) console.warn("invoice_lines load failed:", lineErr);

      // Bygg linjer med line_total = unit_price * quantity (så “ekte savings” kan regnes)
      const lines: InvoiceLineRow[] = (lineData ?? []).map((r: any) => {
        const quantity = typeof r.quantity === "number" ? r.quantity : Number(r.quantity ?? 0);
        const unitPrice =
          typeof r.unit_price === "number" ? r.unit_price : Number(r.unit_price ?? 0);

        const lineTotal = quantity > 0 && unitPrice > 0 ? quantity * unitPrice : 0;

        return {
          invoice_id: String(r.invoice_id),
          category: r.category ?? null,
          quantity: quantity || null,
          unit: r.unit ?? null,
          unit_price: unitPrice || null,
          // finance.ts leser line_total først
          line_total: lineTotal,
        } as any;
      });

      // Grupper per leverandør
      const map: Record<string, { invoices: InvoiceRow[]; lines: InvoiceLineRow[] }> = {};

      for (const inv of invoices) {
        const vendor = (inv.vendor ?? "Ukjent").trim() || "Ukjent";
        if (!map[vendor]) map[vendor] = { invoices: [], lines: [] };
        map[vendor].invoices.push(inv);
      }

      for (const ln of lines) {
        const vendor = invoiceVendor[ln.invoice_id] ?? "Ukjent";
        if (!map[vendor]) map[vendor] = { invoices: [], lines: [] };
        map[vendor].lines.push(ln);
      }

      const result: VendorAgg[] = Object.entries(map).map(([vendor, group]) => {
        const totalSpendNok = group.invoices.reduce((sum, r) => sum + (r.total ?? 0), 0);
        const totalCo2Kg = group.invoices.reduce((sum, r) => sum + (r.total_co2_kg ?? 0), 0);

        const shadowCostNok = (totalCo2Kg / 1000) * SHADOW_PRICE_PER_TONN_NOK;

        return {
          vendor,
          totalSpendNok,
          totalCo2Kg,
          shadowCostNok,
          shadowSavingsByScenario: calculateShadowSavingsFromInvoices(group.invoices, DEFAULT_SCENARIOS),
          realSavings: calculateRealSavingsFromLines(group.lines),
        };
      });

      result.sort((a, b) => b.totalCo2Kg - a.totalCo2Kg);
      setVendors(result);
    } catch (e: any) {
      setError(e?.message ?? "Ukjent feil");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();

    const ch = supabase
      .channel("measures-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "invoice_lines" }, load)
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    return {
      spend: vendors.reduce((s, v) => s + v.totalSpendNok, 0),
      co2: vendors.reduce((s, v) => s + v.totalCo2Kg, 0),
      shadow: vendors.reduce((s, v) => s + v.shadowCostNok, 0),
    };
  }, [vendors]);

  if (loading) return <div className="p-6">Laster tiltak…</div>;
  if (error) return <div className="p-6 text-red-600">Feil: {error}</div>;

  return (
    <div className="p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Tiltak</h1>
        <p className="text-sm text-neutral-600">
          Summerer <code>amount_nok</code> + <code>total_co2_kg</code> fra <code>invoices</code>.
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card title="Total spend" value={fmtNok(totals.spend)} />
        <Card title="Total CO₂" value={`${fmtNumber(totals.co2)} kg`} />
        <Card title="Total skyggekost" value={fmtNok(totals.shadow)} />
      </section>

      <section className="space-y-4">
        {vendors.map((v) => (
          <div key={v.vendor} className="rounded-2xl border bg-white shadow-sm p-4 space-y-4">
            <div>
              <div className="text-lg font-semibold">{v.vendor}</div>
              <div className="text-sm text-neutral-600">
                Spend: {fmtNok(v.totalSpendNok)} · CO₂: {fmtNumber(v.totalCo2Kg)} kg · Skyggekost:{" "}
                {fmtNok(v.shadowCostNok)}
              </div>
            </div>

            <div className="rounded-xl bg-neutral-50 p-3">
              <div className="text-sm font-medium">Potensiell “sparing” (CO₂-skyggepris)</div>
              <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
                {v.shadowSavingsByScenario.map((s) => (
                  <div key={s.scenarioLabel} className="rounded-xl border bg-white p-3">
                    <div className="text-sm font-semibold">{s.scenarioLabel}</div>
                    <div className="text-sm">CO₂-kutt: {fmtNumber(s.co2ReducedKg)} kg</div>
                    <div className="text-sm">Skygge-sparing: {fmtNok(s.shadowSavingsNok)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-neutral-50 p-3">
              <div className="text-sm font-medium">Estimert “ekte” kost-sparing (fra invoice_lines)</div>
              <div className="text-xs text-neutral-600">
                Krever <code>category</code>, <code>quantity</code>, <code>unit</code> og helst{" "}
                <code>unit_price</code>.
              </div>

              {v.realSavings.length === 0 ? (
                <div className="mt-2 text-sm text-neutral-600">
                  Ingen linjer med nok data funnet for denne leverandøren.
                </div>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="text-neutral-600">
                      <tr className="text-left">
                        <th className="py-2 pr-4">Kategori</th>
                        <th className="py-2 pr-4">Baseline</th>
                        <th className="py-2 pr-4">Antatt kutt</th>
                        <th className="py-2 pr-4">Kost-sparing</th>
                        <th className="py-2 pr-4">CO₂-sparing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {v.realSavings.map((r) => (
                        <tr key={r.category} className="border-t">
                          <td className="py-2 pr-4 font-medium">{r.category}</td>
                          <td className="py-2 pr-4">
                            {fmtNumber(r.baselineQuantity)} {r.unit} · {fmtNok(r.baselineSpendNok)}
                          </td>
                          <td className="py-2 pr-4">
                            {fmtNumber(r.assumedReductionRate * 100, 0)}% → {fmtNumber(r.quantityReduced)}{" "}
                            {r.unit}
                          </td>
                          <td className="py-2 pr-4">{fmtNok(r.costSavingsNok)}</td>
                          <td className="py-2 pr-4">{fmtNumber(r.co2SavingsKg)} kg</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="text-sm">
              <div className="font-medium">Forslag til tiltak</div>
              <ul className="list-disc ml-5 text-neutral-700">
                <li>Forhandle grønne alternativer / lavere utslippsintensitet.</li>
                <li>Be om EPD eller leverandørens Scope 1–3-data.</li>
                <li>Endre volum, logistikk eller substituer produkter der mulig.</li>
              </ul>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border bg-white shadow-sm p-4">
      <div className="text-sm text-neutral-600">{title}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

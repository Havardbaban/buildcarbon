// src/pages/TiltakPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { ACTIVE_ORG_ID } from "../lib/org";

type Row = {
  vendor: string | null;
  category: string | null;
  total_co2_kg: number | null;
  amount_nok: number | null;
};

export default function TiltakPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("invoices")
        .select("vendor, category, total_co2_kg, amount_nok")
        .eq("org_id", ACTIVE_ORG_ID);

      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }
      setRows((data ?? []) as Row[]);
      setLoading(false);
    }

    load();
  }, []);

  const byCategory = useMemo(() => {
    const map = new Map<string, { co2: number; spend: number }>();
    for (const r of rows) {
      const cat = (r.category ?? "other") as string;
      const entry = map.get(cat) ?? { co2: 0, spend: 0 };
      entry.co2 += r.total_co2_kg ?? 0;
      entry.spend += r.amount_nok ?? 0;
      map.set(cat, entry);
    }
    return Array.from(map.entries())
      .map(([category, v]) => ({
        category,
        co2: Math.round(v.co2 * 10) / 10,
        spend: Math.round(v.spend),
      }))
      .sort((a, b) => b.co2 - a.co2);
  }, [rows]);

  const topVendors = useMemo(() => {
    const map = new Map<string, { co2: number; spend: number }>();
    for (const r of rows) {
      const vendor = r.vendor ?? "Unknown vendor";
      const entry = map.get(vendor) ?? { co2: 0, spend: 0 };
      entry.co2 += r.total_co2_kg ?? 0;
      entry.spend += r.amount_nok ?? 0;
      map.set(vendor, entry);
    }
    return Array.from(map.entries())
      .map(([vendor, v]) => ({
        vendor,
        co2: Math.round(v.co2 * 10) / 10,
        spend: Math.round(v.spend),
      }))
      .sort((a, b) => b.co2 - a.co2)
      .slice(0, 10);
  }, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Tiltak</h1>
        <p className="text-sm text-gray-500">
          Konkrete områder der dere kan redusere utslipp og kostnader.
        </p>
      </div>

      {loading && <p className="text-sm text-gray-400">Loading…</p>}

      {!loading && !rows.length && (
        <p className="text-sm text-gray-500">
          Ingen fakturaer enda. Last opp fakturaer for å få forslag til tiltak.
        </p>
      )}

      {!loading && rows.length > 0 && (
        <>
          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold">Største utslipp per kategori</h2>
            <table className="w-full text-left text-xs md:text-sm">
              <thead className="border-b text-gray-500">
                <tr>
                  <th className="py-1 pr-2">Kategori</th>
                  <th className="py-1 pr-2 text-right">CO₂ (kg)</th>
                  <th className="py-1 pr-2 text-right">Spend (NOK)</th>
                  <th className="py-1 pr-2 text-right">Forslag</th>
                </tr>
              </thead>
              <tbody>
                {byCategory.map((row) => (
                  <tr key={row.category} className="border-b last:border-0">
                    <td className="py-1 pr-2 capitalize">{row.category}</td>
                    <td className="py-1 pr-2 text-right">
                      {row.co2.toLocaleString("nb-NO")} kg
                    </td>
                    <td className="py-1 pr-2 text-right">
                      {row.spend.toLocaleString("nb-NO")} kr
                    </td>
                    <td className="py-1 pr-2 text-right text-xs text-gray-600">
                      {suggestionForCategory(row.category)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold">Topp 10 leverandører etter CO₂</h2>
            <table className="w-full text-left text-xs md:text-sm">
              <thead className="border-b text-gray-500">
                <tr>
                  <th className="py-1 pr-2">Leverandør</th>
                  <th className="py-1 pr-2 text-right">CO₂ (kg)</th>
                  <th className="py-1 pr-2 text-right">Spend (NOK)</th>
                </tr>
              </thead>
              <tbody>
                {topVendors.map((row) => (
                  <tr key={row.vendor} className="border-b last:border-0">
                    <td className="py-1 pr-2">{row.vendor}</td>
                    <td className="py-1 pr-2 text-right">
                      {row.co2.toLocaleString("nb-NO")} kg
                    </td>
                    <td className="py-1 pr-2 text-right">
                      {row.spend.toLocaleString("nb-NO")} kr
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function suggestionForCategory(category: string): string {
  switch (category) {
    case "energy":
      return "Forhandle strømavtale, senk forbruk og vurder energieffektivisering.";
    case "fuel":
      return "Reduser bilbruk, bytt til elbil eller samkjøring der det er mulig.";
    case "travel":
      return "Kutt flyreiser, bruk tog eller digitale møter der det er mulig.";
    case "hotel":
      return "Samle reiser, velg hoteller med miljøsertifisering.";
    case "goods":
      return "Kjøp mer energieffektivt utstyr og lengre levetid på produkter.";
    case "services":
      return "Sjekk om leverandører har klimamål og miljøsertifisering.";
    default:
      return "Gå gjennom kostnadene og identifiser unødvendig forbruk.";
  }
}

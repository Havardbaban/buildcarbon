// src/pages/Measures.tsx

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { ACTIVE_ORG_ID } from "../lib/org";
import { SHADOW_PRICE_PER_TONN_NOK } from "../lib/finance";

type InvoiceRow = {
  id: string;
  vendor: string | null;
  total: number | null;        // NOK
  total_co2_kg: number | null; // kg
};

type VendorMeasure = {
  vendor: string;
  totalCo2Kg: number;
  totalSpendNok: number;
  shadowCostNok: number;
  potentialReductionKg: number;
};

export default function MeasuresPage() {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load(source: "initial" | "realtime" | "manual" = "manual") {
    setLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, vendor, total, total_co2_kg")
        .eq("org_id", ACTIVE_ORG_ID)
        .limit(1000);

      if (error) {
        console.error("[Measures] load error", error);
        setError("Kunne ikke hente fakturaer til tiltak.");
        setRows([]);
        return;
      }

      setRows((data ?? []) as InvoiceRow[]);
    } catch (err: any) {
      console.error("[Measures] unknown load error", err);
      setError("Ukjent feil ved henting av data til tiltak.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let isMounted = true;

    load("initial");

    const channel = supabase
      .channel("invoices-measures")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "invoices",
        },
        (payload) => {
          const orgId =
            (payload.new as any)?.org_id ?? (payload.old as any)?.org_id;
          if (orgId === ACTIVE_ORG_ID && isMounted) {
            load("realtime");
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const vendorMeasures: VendorMeasure[] = useMemo(() => {
    const map = new Map<string, { totalCo2Kg: number; totalSpendNok: number }>();

    for (const row of rows) {
      const vendor =
        row.vendor && row.vendor.trim() !== "" ? row.vendor : "Ukjent leverandør";
      const current = map.get(vendor) ?? { totalCo2Kg: 0, totalSpendNok: 0 };
      current.totalCo2Kg += row.total_co2_kg ?? 0;
      current.totalSpendNok += row.total ?? 0;
      map.set(vendor, current);
    }

    const list: VendorMeasure[] = Array.from(map.entries()).map(
      ([vendor, v]) => {
        const shadowCostNok = (v.totalCo2Kg / 1000) * SHADOW_PRICE_PER_TONN_NOK;
        const potentialReductionKg = v.totalCo2Kg * 0.3; // 30 % scenario

        return {
          vendor,
          totalCo2Kg: v.totalCo2Kg,
          totalSpendNok: v.totalSpendNok,
          shadowCostNok,
          potentialReductionKg,
        };
      }
    );

    // sortér på høyest utslipp først
    return list.sort((a, b) => b.totalCo2Kg - a.totalCo2Kg);
  }, [rows]);

  return (
    <div className="space-y-6">
      <header className="pb-4 border-b border-slate-200">
        <h1 className="text-2xl font-semibold text-slate-900">Tiltak</h1>
        <p className="mt-1 text-sm text-slate-600">
          Enkle forslag basert på hvilke leverandører som gir mest utslipp.
        </p>
      </header>

      {loading && (
        <p className="text-sm text-slate-500">Laster tiltak…</p>
      )}

      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {!loading && !error && vendorMeasures.length === 0 && (
        <p className="text-sm text-slate-500">
          Ingen fakturaer funnet – last opp fakturaer for å få tiltak.
        </p>
      )}

      {!loading &&
        !error &&
        vendorMeasures.map((v) => (
          <article
            key={v.vendor}
            className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row"
          >
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                {v.vendor}
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Utslipp:{" "}
                <strong>
                  {v.totalCo2Kg.toLocaleString("nb-NO", {
                    maximumFractionDigits: 1,
                  })}{" "}
                  kg CO₂
                </strong>
                {" · "}Kostnad:{" "}
                <strong>
                  {v.totalSpendNok.toLocaleString("nb-NO", {
                    style: "currency",
                    currency: "NOK",
                    maximumFractionDigits: 0,
                  })}
                </strong>
                {" · "}Skyggekostnad:{" "}
                <strong>
                  {v.shadowCostNok.toLocaleString("nb-NO", {
                    style: "currency",
                    currency: "NOK",
                    maximumFractionDigits: 0,
                  })}
                </strong>
              </p>

              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-600">
                <li>Forhandle ny avtale eller pris med leverandør.</li>
                <li>
                  Be om grønnere produkter/tjenester (fornybar energi, transport,
                  osv.).
                </li>
                <li>
                  Vurder alternative leverandører med lavere utslipp.
                </li>
              </ul>
            </div>

            <div className="flex items-center justify-end md:w-48">
              <div className="text-right text-xs text-slate-600">
                <div className="font-semibold text-slate-900">
                  Potensiell reduksjon
                </div>
                <div className="text-sm font-semibold text-emerald-700">
                  {v.potentialReductionKg.toLocaleString("nb-NO", {
                    maximumFractionDigits: 1,
                  })}{" "}
                  kg CO₂
                </div>
              </div>
            </div>
          </article>
        ))}
    </div>
  );
}

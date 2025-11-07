import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Rollup = {
  org_id: string;
  month: string;         // ISO date
  category: string;      // e.g. Electricity, Transport
  co2e_t: number;        // tons CO2e
  spend_nok: number;     // NOK
};

export default function Hotspots() {
  const [rows, setRows] = useState<Rollup[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("rollup_monthly")
        .select("*")
        .order("month", { ascending: false })
        .limit(10);
      if (error) setErr(error.message);
      else setRows((data as Rollup[]) || []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <p>Loading hotspots…</p>;
  if (err) return <p className="text-red-600">Error: {err}</p>;
  if (!rows.length) return <p>No emissions yet. Add a few invoices to see hotspots.</p>;

  return (
    <div className="grid gap-3">
      {rows.map((r, i) => (
        <div key={i} className="rounded-xl border bg-white p-4 flex justify-between">
          <div>
            <p className="text-sm text-slate-500">
              {new Date(r.month).toLocaleDateString("no-NO", { year: "numeric", month: "short" })}
            </p>
            <p className="font-medium">{r.category}</p>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500">CO₂e</div>
            <div className="text-lg font-semibold">{r.co2e_t.toFixed(2)} t</div>
            <div className="text-xs text-slate-500 mt-1">
              Spend NOK {Math.round(r.spend_nok).toLocaleString("no-NO")}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

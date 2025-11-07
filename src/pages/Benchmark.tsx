import Nav from "../components/Nav";
import Hotspots from "../components/Hotspots";

type Row = { sector: string; size: string; kwhPerM2: number; co2PerM2: number; note?: string };

const DATA: Row[] = [
  { sector: "Office",  size: "1k–5k m²",  kwhPerM2: 140, co2PerM2: 24, note: "Nordic avg est." },
  { sector: "Office",  size: "5k–20k m²", kwhPerM2: 130, co2PerM2: 22 },
  { sector: "Light Manufacturing", size: "Any", kwhPerM2: 180, co2PerM2: 31 },
  { sector: "Retail", size: "Street",     kwhPerM2: 160, co2PerM2: 28 },
];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-4 bg-white">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

export default function Benchmark() {
  const yourIntensity = 120;             // demo value
  const sectorAvg = 140;                 // from DATA[0]
  const delta = sectorAvg - yourIntensity;
  const better = delta > 0;

  return (
    <div>
      <Nav />

      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-semibold mb-1">Benchmark — where you stand</h1>
        <p className="text-slate-600 mb-6">
          Indicative peer performance. MVP will compute this from uploads and sector datasets.
        </p>

        <div className="grid md:grid-cols-3 gap-4">
          <Stat label="Your intensity (demo)" value={`${yourIntensity} kWh/m²`} />
          <Stat label="Sector average" value={`${sectorAvg} kWh/m²`} />
          <Stat
            label={better ? "Better than sector" : "Worse than sector"}
            value={`${Math.abs(delta)} kWh/m²`}
          />
        </div>

        <div className="mt-8 rounded-2xl border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="px-2 py-2 text-left">Sector</th>
                <th className="px-2 py-2 text-left">Size</th>
                <th className="px-2 py-2 text-left">kWh/m²</th>
                <th className="px-2 py-2 text-left">kgCO₂e/m²</th>
                <th className="px-2 py-2 text-left">Note</th>
              </tr>
            </thead>
            <tbody>
              {DATA.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-2 py-2">{r.sector}</td>
                  <td className="px-2 py-2">{r.size}</td>
                  <td className="px-2 py-2">{r.kwhPerM2}</td>
                  <td className="px-2 py-2">{r.co2PerM2}</td>
                  <td className="px-2 py-2 text-slate-500">{r.note || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* New: live data from Supabase */}
        <section className="mt-12">
          <h2 className="text-xl font-semibold mb-3">Hotspots (monthly CO₂ & spend)</h2>
          <Hotspots />
        </section>
      </main>
    </div>
  );
}

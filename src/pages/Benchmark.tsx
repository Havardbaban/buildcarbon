import Nav from "../components/Nav";

type Row = { sector: string; size: string; kwhPerM2: number; co2PerM2: number; note?: string };
const DATA: Row[] = [
  { sector: "Office",             size: "1k–5k m²", kwhPerM2: 140, co2PerM2: 24, note: "Nordic avg est." },
  { sector: "Office",             size: "5k–20k m²", kwhPerM2: 130, co2PerM2: 22 },
  { sector: "Light Manufacturing",size: "Any",      kwhPerM2: 180, co2PerM2: 31 },
  { sector: "Retail",             size: "Street",   kwhPerM2: 160, co2PerM2: 28 },
];

export default function Benchmark() {
  const yourIntensity = 120; // demo value
  const sectorAvg = 140;     // from DATA[0]
  const delta = sectorAvg - yourIntensity;
  const better = delta > 0;

  return (
    <div>
      <Nav />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Benchmark — where you stand</h1>
        <p className="text-slate-600 mt-1 text-sm">
          Indicative peer performance. MVP will compute this from uploads and sector datasets.
        </p>

        <div className="mt-6 grid md:grid-cols-3 gap-4">
          <Stat label="Your intensity (demo)" value={`${yourIntensity} kWh/m²`} />
          <Stat label="Sector average" value={`${sectorAvg} kWh/m²`} />
          <Stat label={better ? "Better than sector" : "Worse than sector"} value={`${Math.abs(delta)} kWh/m²`} />
        </div>

        <div className="mt-8 rounded-2xl border">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b">
                <th className="py-2 px-4">Sector</th>
                <th className="py-2 px-4">Size</th>
                <th className="py-2 px-4">kWh/m²</th>
                <th className="py-2 px-4">kg CO₂e/m²</th>
                <th className="py-2 px-4">Notes</th>
              </tr>
            </thead>
            <tbody>
              {DATA.map((r, i) => (
                <tr key={i} className="border-b">
                  <td className="py-2 px-4">{r.sector}</td>
                  <td className="py-2 px-4">{r.size}</td>
                  <td className="py-2 px-4">{r.kwhPerM2}</td>
                  <td className="py-2 px-4">{r.co2PerM2}</td>
                  <td className="py-2 px-4 text-slate-500">{r.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-slate-500 mt-3">
          Placeholder values for demo purposes. Replace with national datasets in MVP.
        </p>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border p-4">
      <div className="text-slate-500 text-sm">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

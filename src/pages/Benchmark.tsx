// src/pages/Benchmark.tsx
import React from "react";
import Hotspots from "../components/Hotspots";

type Row = {
  sector: string;
  size: string;
  kwhPerM2: number;
  co2PerM2: number;
  note?: string;
};

const DATA: Row[] = [
  { sector: "Office", size: "1k–5k m²", kwhPerM2: 140, co2PerM2: 24, note: "Nordic avg est." },
  { sector: "Office", size: "5k–20k m²", kwhPerM2: 120, co2PerM2: 22 },
  { sector: "Light Manufacturing", size: "Any", kwhPerM2: 180, co2PerM2: 31 },
  { sector: "Retail", size: "Street", kwhPerM2: 100, co2PerM2: 28 },
];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-4 bg-white shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

export default function Benchmark({ disabled }: { disabled?: boolean }) {
  // 🔒 If disabled (MVP) → show placeholder
  if (disabled) {
    return (
      <main className="mx-auto max-w-xl px-4 py-8 text-center opacity-70">
        <h1 className="text-2xl font-semibold mb-3">Benchmark kommer snart</h1>
        <p className="text-slate-600">
          Denne funksjonen blir aktiv når vi lanserer pilot-versjonen med sektordata og automatiske sammenligninger.
        </p>
      </main>
    );
  }

  // 🔓 ORIGINAL BENCHMARK LOGIC (kept intact)
  const yourIntensity = 120; // demo placeholder
  const sectorAvg = 140; // from DATA[0]

  const delta = sectorAvg - yourIntensity;
  const better = delta >= 0;

  return (
    <div>
      <nav></nav>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-semibold">Benchmark – where you stand</h1>
        <p className="text-slate-600 mt-1 text-sm">
          Indicative peer performance. MVP will compute this from uploads and sector datasets.
        </p>

        <div className="mt-6 grid md:grid-cols-3 gap-4">
          <Stat label="Your intensity (demo)" value={`${yourIntensity} kWh/m²`} />
          <Stat label="Sector average (demo)" value={`${sectorAvg} kWh/m²`} />
          <Stat
            label={better ? "Better than sector" : "Worse than sector"}
            value={`${Math.abs(delta)} kWh/m²`}
          />
        </div>

        <div className="mt-8 rounded-xl border overflow-x-auto bg-white shadow-sm p-4">
          <table className="w-full text-sm">
            <thead className="text-slate-500 border-b">
              <tr>
                <th className="px-2 py-2 text-left">Sector</th>
                <th className="px-2 py-2 text-left">Size</th>
                <th className="px-2 py-2 text-left">kWh/m²</th>
                <th className="px-2 py-2 text-left">CO₂/m²</th>
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
                  <td className="px-2 py-2">{r.note ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-10">
          <Hotspots />
        </div>
      </main>
    </div>
  );
}

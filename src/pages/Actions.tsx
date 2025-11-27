// src/pages/Actions.tsx

import React, { useEffect, useState } from "react";
import supabase from "../lib/supabase";

type ActionRow = {
  id: string;
  vendor_name: string | null;
  category: string | null;
  total_amount: number | null;
  potential_savings_nok: number | null;
  potential_savings_co2: number | null;
};

const ACTIVE_ORG_ID = import.meta.env.VITE_ACTIVE_ORG_ID as string;

function formatNumber(value: number | null | undefined, decimals = 0) {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("nb-NO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function mapCategoryLabel(category: string | null) {
  switch (category) {
    case "electricity":
      return "Strøm / energi";
    case "fuel":
      return "Drivstoff";
    case "waste":
      return "Avfall";
    case "building":
      return "Bygg / eiendom";
    case "transport":
      return "Transport / logistikk";
    case "other":
      return "Andre kostnader";
    default:
      return "Ukjent";
  }
}

const ActionsPage: React.FC = () => {
  const [rows, setRows] = useState<ActionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data, error } = await supabase
        .from("document")
        .select(
          "id, vendor_name, category, total_amount, potential_savings_nok, potential_savings_co2"
        )
        .eq("org_id", ACTIVE_ORG_ID)
        .not("potential_savings_nok", "is", null)
        .order("potential_savings_nok", { ascending: false });

      if (error) {
        console.error("Error loading actions", error);
        setRows([]);
      } else {
        setRows((data || []) as ActionRow[]);
      }
      setLoading(false);
    }

    load();
  }, []);

  const totalPotentialNok = rows.reduce(
    (sum, r) => sum + (r.potential_savings_nok || 0),
    0
  );

  const totalPotentialCo2 = rows.reduce(
    (sum, r) => sum + (r.potential_savings_co2 || 0),
    0
  );

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1>Tiltak & besparelser</h1>
          <p>
            Basert på fakturaene dine estimerer vi hvor mye du kan spare i
            kroner og CO₂ per år.
          </p>
        </div>
      </header>

      <section className="summary-cards">
        <div className="summary-card">
          <h2>Potensiell årlig besparelse</h2>
          <p className="summary-value">
            {formatNumber(totalPotentialNok, 0)} kr / år
          </p>
          <p className="summary-subtitle">
            Estimat basert på nåværende kostnadsnivå.
          </p>
        </div>
        <div className="summary-card">
          <h2>Potensiell CO₂-reduksjon</h2>
          <p className="summary-value">
            {formatNumber(totalPotentialCo2, 0)} kg CO₂ / år
          </p>
          <p className="summary-subtitle">
            Grovt anslag – fint for bank, revisor og Innovasjon Norge.
          </p>
        </div>
      </section>

      <section className="table-section">
        <h2>Prioriterte tiltak per leverandør</h2>

        {loading ? (
          <p>Laster tiltak…</p>
        ) : rows.length === 0 ? (
          <p>
            Ingen tiltak er beregnet enda. Last opp noen fakturaer først, så
            fyller vi denne listen automatisk.
          </p>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Leverandør</th>
                  <th>Kategori</th>
                  <th>Fakturabeløp (per mnd)</th>
                  <th>Årlig besparelse (NOK)</th>
                  <th>Årlig CO₂-reduksjon (kg)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.vendor_name || "Ukjent"}</td>
                    <td>{mapCategoryLabel(row.category)}</td>
                    <td>{formatNumber(row.total_amount, 0)} kr</td>
                    <td>
                      {formatNumber(row.potential_savings_nok, 0)} kr / år
                    </td>
                    <td>
                      {formatNumber(row.potential_savings_co2, 0)} kg / år
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default ActionsPage;

import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

type Invoice = {
  id: string;
  date: string | null;
  vendor: string | null;
  total: number | null;
  status: string;
};

export default function InvoiceTable({ refreshKey }: { refreshKey: string }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);

  async function fetchInvoices() {
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) console.error(error);
    else setInvoices(data || []);
  }

  // Fetch invoices on load + when refreshKey changes
  useEffect(() => {
    fetchInvoices();
  }, [refreshKey]);

  // 🔁 Realtime listener for live updates
  useEffect(() => {
    const channel = supabase
      .channel("invoices-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices" },
        (payload) => {
          console.log("Realtime change:", payload);
          fetchInvoices(); // refresh data instantly
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <table className="w-full text-sm text-left border-collapse">
      <thead>
        <tr className="border-b">
          <th className="p-2">Date</th>
          <th className="p-2">Vendor</th>
          <th className="p-2">Total (NOK)</th>
          <th className="p-2">Status</th>
          <th className="p-2">File</th>
        </tr>
      </thead>
      <tbody>
        {invoices.map((inv) => (
          <tr key={inv.id} className="border-b">
            <td className="p-2">{inv.date || "–"}</td>
            <td className="p-2">{inv.vendor || "–"}</td>
            <td className="p-2">{inv.total ?? "–"}</td>
            <td className="p-2">{inv.status}</td>
            <td className="p-2">{inv.filename || "–"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

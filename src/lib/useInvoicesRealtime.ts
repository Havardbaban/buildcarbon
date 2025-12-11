// src/lib/useInvoicesRealtime.ts
import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { ACTIVE_ORG_ID } from "./org";

export type Invoice = {
  id: string;
  invoice_date: string | null;
  due_date: string | null;
  amount_nok: number | null;
  vendor: string | null;
  invoice_no: string | null;
  currency: string | null;
  total_co2_kg: number | null;
  status: string | null;
  org_id: string;
};

type UseInvoicesResult = {
  invoices: Invoice[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

export function useInvoicesRealtime(): UseInvoicesResult {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("org_id", ACTIVE_ORG_ID)
      .order("invoice_date", { ascending: false });

    if (error) {
      console.error("Failed to load invoices", error);
      setError(error.message);
      setInvoices([]);
    } else {
      setInvoices(data as Invoice[]);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    // initial load
    load();
  }, [load]);

  useEffect(() => {
    // realtime-oppdatering på alle endringer i invoices for aktiv org
    const channel = supabase
      .channel(`invoices-realtime-${ACTIVE_ORG_ID}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "invoices",
          filter: `org_id=eq.${ACTIVE_ORG_ID}`,
        },
        () => {
          // Når noe endres (INSERT/UPDATE/DELETE) → hente alt på nytt
          load();
        }
      )
      .subscribe((status) => {
        console.log("Invoices realtime status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  return { invoices, loading, error, reload: load };
}

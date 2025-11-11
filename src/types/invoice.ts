export type InvoiceRow = {
  id: string;
  created_at: string;
  filename: string;
  storage_path: string;
  public_url: string | null;
  status: 'uploaded' | 'processing' | 'parsed' | 'failed';
  ocr_text: string | null;
  vendor: string | null;
  invoice_date: string | null; // ISO date string
  total_amount: number | null;
  co2_kg: number | null;
};

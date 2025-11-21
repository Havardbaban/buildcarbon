CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  filename text NOT NULL,
  storage_path text NOT NULL,
  public_url text,
  status text DEFAULT 'uploaded',
  ocr_text text,
  vendor text,
  invoice_no text,
  invoice_date date,
  total numeric,
  currency text DEFAULT 'NOK',
  total_co2_kg numeric
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

# BuildCarbon (MVP)

Vite + React + TS + Tailwind with Invoice Scanner & CO2 Tracking.
Deploy on Vercel: import this repo → Deploy.

## Scripts
- `npm install`
- `npm run dev` (local)
- `npm run build` (production)

## Invoice Scanner Setup

### 1. Database Tables
The invoice tables are created automatically when you first use the scanner. Required tables:
- `invoices` - stores invoice metadata and CO2 calculations
- `invoice_lines` - stores line items from invoices

### 2. Storage Bucket
Create a storage bucket in Supabase Dashboard:
1. Go to Storage in your Supabase Dashboard
2. Create a new bucket named `invoices`
3. Set it to **public** access
4. Save

### 3. How It Works
- Upload PDF or image invoices at `/scanner`
- OCR automatically extracts vendor, invoice number, date, and total
- CO2 emissions are calculated based on energy/fuel usage detected in the invoice
- All data is stored in Supabase and displayed in the table

### CO2 Emission Factors
- Electricity: 0.028 kg CO2/kWh
- Diesel: 2.68 kg CO2/liter
- Petrol: 2.31 kg CO2/liter
- Gas: 2.0 kg CO2/m³

## Notes
- Edit `src/App.tsx` to change copy or defaults.
- Currency is NOK by default; change in extraction logic if needed.

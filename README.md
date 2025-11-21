# BuildCarbon - Invoice Scanner & CO2 Tracker

Automated invoice scanning with OCR and carbon emissions calculation. Built with Vite + React + TypeScript + Tailwind + Supabase.

## Quick Start

```bash
npm install
npm run dev
```

## Features

### Invoice Scanner (`/invoices`)
- Upload PDF or image invoices
- Automatic OCR text extraction using Tesseract.js
- Smart data extraction (vendor, invoice #, date, amount)
- Automatic CO2 calculation based on energy/fuel usage
- All data stored in Supabase

### Dashboard (`/dashboard`)
- Total emissions and spending overview
- Monthly CO2 trend visualization
- Emissions breakdown (high vs low impact)
- Potential savings calculator
- Full invoice ESG table

## Setup

### 1. Storage Bucket (Required)
Create a Supabase storage bucket:
1. Go to your Supabase Dashboard → Storage
2. Create new bucket: `invoices`
3. Set to **public** access
4. Save

### 2. Database Tables (Auto-created)
Tables are created automatically:
- `invoices` - invoice metadata and CO2 data
- RLS policies enabled for security

### 3. Environment Variables
Already configured in `.env`:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## How It Works

1. **Upload** - Select a PDF or image invoice
2. **OCR Scan** - Tesseract.js extracts text from the document
3. **Smart Parse** - Automatically identifies:
   - Vendor name
   - Invoice number
   - Invoice date
   - Total amount
   - Energy/fuel usage (kWh, liters)
4. **CO2 Calculate** - Applies emission factors:
   - Electricity: 0.028 kg CO2/kWh
   - Diesel: 2.68 kg CO2/liter
   - Petrol: 2.31 kg CO2/liter
   - Gas: 2.0 kg CO2/m³
5. **Store & Display** - Saves to Supabase and shows in dashboard

## Pages

- `/` - Home
- `/invoices` - Upload and scan invoices
- `/dashboard` - ESG metrics and analytics
- `/benchmark` - Benchmarking tools
- `/measures` - Reduction measures
- `/demo` - Demo page

## Build

```bash
npm run build
```

Deploy to Vercel: Import this repo and deploy.

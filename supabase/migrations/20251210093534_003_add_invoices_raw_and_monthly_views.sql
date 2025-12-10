/*
  # Add invoices_raw table and monthly aggregation views for dashboard

  1. New Tables
    - `invoices_raw`
      - Stores raw OCR text and parsed JSON from uploaded invoices
      - Used for audit trail and reprocessing
  
  2. Database Views
    - `monthly_financials` - Monthly aggregated spending by category
    - `monthly_emissions` - Monthly CO2 emissions by ESG scope
    - `esg_metrics` - Current ESG performance metrics
    - `cost_savings_opportunities` - Identifies high-cost, high-emission items
  
  3. Security
    - Enable RLS on invoices_raw table
    - Views inherit security from base tables
*/

-- Create invoices_raw table for audit trail
CREATE TABLE IF NOT EXISTS invoices_raw (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  storage_path text,
  ocr_text text,
  parsed_json jsonb,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE invoices_raw ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for invoices_raw select"
  ON invoices_raw FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow all for invoices_raw insert"
  ON invoices_raw FOR INSERT
  TO public
  WITH CHECK (true);

-- Create view for monthly financial aggregations
CREATE OR REPLACE VIEW monthly_financials AS
SELECT 
  DATE_TRUNC('month', COALESCE(i.invoice_date, i.created_at)) as month,
  il.category,
  il.esg_scope,
  COUNT(DISTINCT i.id) as invoice_count,
  COUNT(il.id) as line_item_count,
  SUM(il.amount) as total_amount,
  AVG(il.amount) as avg_amount,
  SUM(il.co2_kg) as total_co2_kg
FROM invoices i
LEFT JOIN invoice_lines il ON il.invoice_id = i.id
WHERE i.invoice_date IS NOT NULL OR i.created_at IS NOT NULL
GROUP BY DATE_TRUNC('month', COALESCE(i.invoice_date, i.created_at)), il.category, il.esg_scope;

-- Create view for monthly emissions by scope
CREATE OR REPLACE VIEW monthly_emissions AS
SELECT 
  DATE_TRUNC('month', COALESCE(i.invoice_date, i.created_at)) as month,
  il.esg_scope,
  CASE 
    WHEN il.esg_scope = 1 THEN 'Scope 1: Direct'
    WHEN il.esg_scope = 2 THEN 'Scope 2: Energy'
    WHEN il.esg_scope = 3 THEN 'Scope 3: Value Chain'
    ELSE 'Unclassified'
  END as scope_name,
  COUNT(il.id) as item_count,
  SUM(il.co2_kg) as total_co2_kg,
  SUM(il.amount) as total_cost
FROM invoices i
LEFT JOIN invoice_lines il ON il.invoice_id = i.id
WHERE (i.invoice_date IS NOT NULL OR i.created_at IS NOT NULL)
  AND il.esg_scope IS NOT NULL
GROUP BY DATE_TRUNC('month', COALESCE(i.invoice_date, i.created_at)), il.esg_scope;

-- Create view for ESG metrics and scoring
CREATE OR REPLACE VIEW esg_metrics AS
WITH current_period AS (
  SELECT 
    SUM(CASE WHEN il.esg_scope = 1 THEN il.co2_kg ELSE 0 END) as scope1_co2,
    SUM(CASE WHEN il.esg_scope = 2 THEN il.co2_kg ELSE 0 END) as scope2_co2,
    SUM(CASE WHEN il.esg_scope = 3 THEN il.co2_kg ELSE 0 END) as scope3_co2,
    SUM(il.co2_kg) as total_co2,
    SUM(il.amount) as total_spend,
    COUNT(DISTINCT i.id) as invoice_count
  FROM invoices i
  LEFT JOIN invoice_lines il ON il.invoice_id = i.id
  WHERE i.created_at >= NOW() - INTERVAL '30 days'
),
intensity AS (
  SELECT 
    CASE 
      WHEN total_spend > 0 THEN total_co2 / (total_spend / 1000)
      ELSE 0 
    END as co2_per_1000_nok
  FROM current_period
),
benchmarks AS (
  SELECT 
    50.0 as target_co2_per_1000_nok,
    0.70 as target_renewable_ratio
)
SELECT 
  cp.*,
  i.co2_per_1000_nok,
  b.target_co2_per_1000_nok,
  CASE 
    WHEN i.co2_per_1000_nok = 0 THEN 100
    WHEN i.co2_per_1000_nok <= b.target_co2_per_1000_nok THEN 100
    ELSE GREATEST(0, 100 - ((i.co2_per_1000_nok - b.target_co2_per_1000_nok) / b.target_co2_per_1000_nok * 100))
  END as esg_score
FROM current_period cp, intensity i, benchmarks b;

-- Create view for cost savings opportunities
CREATE OR REPLACE VIEW cost_savings_opportunities AS
SELECT 
  il.category,
  il.esg_scope,
  COUNT(il.id) as occurrence_count,
  SUM(il.amount) as total_cost,
  SUM(il.co2_kg) as total_co2_kg,
  AVG(il.amount) as avg_cost_per_item,
  AVG(il.co2_kg) as avg_co2_per_item,
  CASE 
    WHEN il.category IN ('fuel_diesel', 'fuel_petrol') THEN 'Switch to electric vehicles'
    WHEN il.category = 'electricity' THEN 'Consider renewable energy contracts'
    WHEN il.category = 'travel_flight' THEN 'Use video meetings or train travel when possible'
    WHEN il.category IN ('heating', 'cooling') THEN 'Improve building insulation and efficiency'
    WHEN il.category = 'waste' THEN 'Implement waste reduction and recycling programs'
    ELSE 'Optimize procurement and choose lower-emission alternatives'
  END as recommendation,
  CASE 
    WHEN il.category IN ('fuel_diesel', 'fuel_petrol') THEN SUM(il.co2_kg) * 0.60
    WHEN il.category = 'electricity' THEN SUM(il.co2_kg) * 0.50
    WHEN il.category = 'travel_flight' THEN SUM(il.co2_kg) * 0.40
    WHEN il.category IN ('heating', 'cooling') THEN SUM(il.co2_kg) * 0.30
    WHEN il.category = 'waste' THEN SUM(il.co2_kg) * 0.25
    ELSE SUM(il.co2_kg) * 0.15
  END as potential_co2_reduction_kg,
  CASE 
    WHEN il.category IN ('fuel_diesel', 'fuel_petrol') THEN SUM(il.amount) * 0.30
    WHEN il.category = 'electricity' THEN SUM(il.amount) * 0.20
    WHEN il.category = 'travel_flight' THEN SUM(il.amount) * 0.35
    WHEN il.category IN ('heating', 'cooling') THEN SUM(il.amount) * 0.25
    WHEN il.category = 'waste' THEN SUM(il.amount) * 0.20
    ELSE SUM(il.amount) * 0.10
  END as potential_cost_savings_nok
FROM invoice_lines il
WHERE il.category IS NOT NULL 
  AND il.esg_scope IS NOT NULL
GROUP BY il.category, il.esg_scope
HAVING SUM(il.co2_kg) > 10
ORDER BY SUM(il.co2_kg) DESC;

COMMENT ON VIEW monthly_financials IS 'Monthly financial and emissions data aggregated by category and ESG scope';
COMMENT ON VIEW monthly_emissions IS 'Monthly CO2 emissions broken down by ESG scope';
COMMENT ON VIEW esg_metrics IS 'Current ESG performance metrics and environmental score (0-100)';
COMMENT ON VIEW cost_savings_opportunities IS 'Identifies opportunities to reduce costs and emissions with recommendations';

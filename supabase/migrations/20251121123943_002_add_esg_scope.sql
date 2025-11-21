/*
  # Add ESG Scope Classification to Invoice Line Items

  1. Changes
    - Add `esg_scope` column to `invoice_lines` table (1, 2, or 3)
    - Add `category` column to `invoice_lines` table for emission category classification
    - Add check constraint to ensure esg_scope is 1, 2, or 3
  
  2. ESG Scope Definitions
    - **Scope 1**: Direct emissions from owned or controlled sources
      - Company vehicles (diesel, petrol, gas)
      - On-site fuel combustion
      - Refrigerants and fugitive emissions
    
    - **Scope 2**: Indirect emissions from purchased energy
      - Purchased electricity
      - Purchased heating/cooling
      - Purchased steam
    
    - **Scope 3**: All other indirect emissions in the value chain
      - Business travel (flights, trains, taxis)
      - Employee commuting
      - Waste disposal
      - Purchased goods and services
      - Transportation and distribution
  
  3. Security
    - Maintains existing RLS policies
*/

-- Add esg_scope column to invoice_lines
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_lines' AND column_name = 'esg_scope'
  ) THEN
    ALTER TABLE invoice_lines ADD COLUMN esg_scope INTEGER;
  END IF;
END $$;

-- Add category column to invoice_lines
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'invoice_lines' AND column_name = 'category'
  ) THEN
    ALTER TABLE invoice_lines ADD COLUMN category TEXT;
  END IF;
END $$;

-- Add check constraint for esg_scope
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invoice_lines_esg_scope_check'
  ) THEN
    ALTER TABLE invoice_lines
    ADD CONSTRAINT invoice_lines_esg_scope_check
    CHECK (esg_scope IN (1, 2, 3));
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN invoice_lines.esg_scope IS 'ESG Scope classification: 1=Direct emissions, 2=Purchased energy, 3=Value chain emissions';
COMMENT ON COLUMN invoice_lines.category IS 'Emission category (e.g., electricity, diesel, flight, waste)';

-- Alter suppliers table to support business properties
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS business_name TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS service_radius_km NUMERIC(6,2) NOT NULL DEFAULT 15;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS review_count INT NOT NULL DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- Copy existing names/emails/phones into new columns
UPDATE suppliers SET business_name = name WHERE business_name IS NULL;
UPDATE suppliers SET contact_phone = phone WHERE contact_phone IS NULL;
UPDATE suppliers SET contact_email = email WHERE contact_email IS NULL;

-- Alter materials table to support availability categories and deletion status
ALTER TABLE materials ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'other';
ALTER TABLE materials ADD COLUMN IF NOT EXISTS is_available BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE materials ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;

-- Drop deprecated quotations table and recreate it
DROP TABLE IF EXISTS quotations CASCADE;

CREATE TABLE quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'Pending',
  requested_qty INT NOT NULL DEFAULT 1,
  notes TEXT,
  offered_price DECIMAL(10,2),
  counter_price DECIMAL(10,2),
  available_qty INT,
  delivery_date DATE,
  expires_at TIMESTAMPTZ NOT NULL,
  requested_at TIMESTAMPTZ DEFAULT now(),
  responded_at TIMESTAMPTZ
);

-- Indexing
CREATE INDEX IF NOT EXISTS idx_suppliers_location ON suppliers USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_quotations_supplier ON quotations(supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_quotations_requester ON quotations(requester_id, status);

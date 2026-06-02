-- Add columns to jobs table
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT false;

-- Add completed_jobs to technicians
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS completed_jobs INT DEFAULT 0;

-- Add rating and review_count to suppliers
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS rating DECIMAL(3,2) DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS review_count INT DEFAULT 0;

-- Add counter_count to quotations
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS counter_count INT DEFAULT 0;

-- Unique constraint index for one active job per technician
DROP INDEX IF EXISTS idx_one_active_job_per_tech;
CREATE UNIQUE INDEX idx_one_active_job_per_tech
ON jobs(technician_id)
WHERE status NOT IN ('Completed', 'Cancelled')
AND technician_id IS NOT NULL;

-- Unique constraint index for review direction
DROP INDEX IF EXISTS idx_unique_review;
CREATE UNIQUE INDEX idx_unique_review
ON reviews(job_id, reviewer_id);

-- Unique constraint index for one open dispute per job
DROP INDEX IF EXISTS idx_one_open_dispute;
CREATE UNIQUE INDEX idx_one_open_dispute
ON disputes(job_id)
WHERE status IN ('Open', 'UnderReview', 'open', 'in_review');

-- Drop existing constraints if any to ensure clean additions
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS chk_rating_range;
ALTER TABLE reviews ADD CONSTRAINT chk_rating_range CHECK (rating >= 1 AND rating <= 5);

ALTER TABLE payments DROP CONSTRAINT IF EXISTS chk_amount_positive;
ALTER TABLE payments ADD CONSTRAINT chk_amount_positive CHECK (amount > 0);

ALTER TABLE materials DROP CONSTRAINT IF EXISTS chk_price_positive;
ALTER TABLE materials ADD CONSTRAINT chk_price_positive CHECK (unit_price > 0);

ALTER TABLE materials DROP CONSTRAINT IF EXISTS chk_stock_nonnegative;
ALTER TABLE materials ADD CONSTRAINT chk_stock_nonnegative CHECK (stock_quantity >= 0);

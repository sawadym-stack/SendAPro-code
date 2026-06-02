-- Add email verification and approval flow fields to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT NULL;
-- approval_status: NULL (not required), 'pending', 'approved', 'rejected', 'expired'
ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_requested_at TIMESTAMPTZ;

-- Mark existing customers as email verified (seeded data)
UPDATE users SET email_verified = TRUE WHERE role = 'customer';
-- Mark existing admin as email verified
UPDATE users SET email_verified = TRUE WHERE role = 'admin';
-- Mark existing technicians/suppliers as approved (seeded data)
UPDATE users SET email_verified = TRUE, approval_status = 'approved' WHERE role IN ('technician', 'supplier');

-- Approval requests table (one per registration attempt for tech/supplier)
CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  -- status: pending, approved, rejected, expired
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '48 hours',
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  admin_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_user ON approval_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_approval_requests_role ON approval_requests(role, status);

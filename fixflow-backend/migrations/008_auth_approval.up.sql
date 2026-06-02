-- Add approval-related columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'auto_approved' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'auto_approved'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_requested_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_phone_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN DEFAULT FALSE;

-- Create admin_approvals table to track approval requests
CREATE TABLE IF NOT EXISTS admin_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  user_role VARCHAR(20) NOT NULL CHECK (user_role IN ('technician', 'supplier')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '48 hours'),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_approvals_status ON admin_approvals(status);
CREATE INDEX IF NOT EXISTS idx_admin_approvals_user_role ON admin_approvals(user_role);
CREATE INDEX IF NOT EXISTS idx_admin_approvals_expires_at ON admin_approvals(expires_at) WHERE status = 'pending';

-- Technicians table approval relationship
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS approval_id UUID REFERENCES admin_approvals(id) ON DELETE SET NULL;

-- Suppliers table approval relationship
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS approval_id UUID REFERENCES admin_approvals(id) ON DELETE SET NULL;

-- Create index for verification status
CREATE INDEX IF NOT EXISTS idx_users_approval_status ON users(approval_status);
CREATE INDEX IF NOT EXISTS idx_users_is_verified ON users(is_verified);

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_emergency BOOLEAN DEFAULT false;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
ALTER TABLE technicians ADD COLUMN IF NOT EXISTS review_count INT DEFAULT 0;

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id),
  reviewer_id UUID NOT NULL REFERENCES users(id),
  reviewee_id UUID NOT NULL REFERENCES users(id),
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL,
  image_urls TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_reviewee ON reviews(reviewee_id);
CREATE INDEX IF NOT EXISTS idx_reviews_job_reviewer ON reviews(job_id, reviewer_id);

CREATE TABLE IF NOT EXISTS disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id),
  raised_by_id UUID NOT NULL REFERENCES users(id),
  against_id UUID NOT NULL REFERENCES users(id),
  reason VARCHAR(50) NOT NULL,
  description TEXT NOT NULL,
  evidence_urls TEXT[] DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'Open',
  admin_note TEXT,
  action VARCHAR(20),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disputes_status ON disputes(status);
CREATE INDEX IF NOT EXISTS idx_disputes_raised_by ON disputes(raised_by_id);

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID UNIQUE NOT NULL REFERENCES jobs(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  reminder_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_time ON scheduled_jobs(scheduled_at) WHERE reminder_sent = false;

CREATE OR REPLACE FUNCTION update_technician_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE technicians
  SET avg_rating = COALESCE((
    SELECT ROUND(AVG(rating)::numeric, 2)
    FROM reviews 
    WHERE reviewee_id = NEW.reviewee_id
  ), 0.0),
  review_count = COALESCE((
    SELECT COUNT(*) FROM reviews
    WHERE reviewee_id = NEW.reviewee_id
  ), 0)
  WHERE user_id = NEW.reviewee_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_rating ON reviews;
CREATE TRIGGER trigger_update_rating
AFTER INSERT ON reviews
FOR EACH ROW
EXECUTE FUNCTION update_technician_rating();

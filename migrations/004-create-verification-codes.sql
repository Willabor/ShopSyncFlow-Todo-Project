-- Migration: 004-create-verification-codes.sql
-- Date: 2025-12-01
-- Purpose: Email verification for registration

CREATE TABLE IF NOT EXISTS verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  code VARCHAR(6) NOT NULL,
  purpose VARCHAR(50) NOT NULL DEFAULT 'registration',
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  expires_at TIMESTAMP NOT NULL,
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  CONSTRAINT valid_purpose CHECK (purpose IN ('registration', 'password_reset', 'email_change')),
  CONSTRAINT valid_code CHECK (code ~ '^[0-9]{6}$')
);

CREATE INDEX IF NOT EXISTS idx_verification_codes_email ON verification_codes(email);
CREATE INDEX IF NOT EXISTS idx_verification_codes_lookup ON verification_codes(email, code, purpose) WHERE verified_at IS NULL;

COMMENT ON TABLE verification_codes IS 'Email verification codes for registration and account recovery';

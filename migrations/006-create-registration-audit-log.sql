-- Migration: 006-create-registration-audit-log.sql
-- Date: 2025-12-01
-- Purpose: Audit trail for registration events

CREATE TABLE IF NOT EXISTS registration_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,
  email VARCHAR(255),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  CONSTRAINT valid_event_type CHECK (event_type IN (
    'verification_code_sent', 'verification_code_verified', 'verification_code_failed',
    'registration_started', 'registration_completed', 'registration_failed',
    'invitation_sent', 'invitation_accepted', 'invitation_expired', 'invitation_revoked'
  ))
);

CREATE INDEX IF NOT EXISTS idx_registration_audit_email ON registration_audit_log(email);
CREATE INDEX IF NOT EXISTS idx_registration_audit_tenant ON registration_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_registration_audit_type ON registration_audit_log(event_type);

COMMENT ON TABLE registration_audit_log IS 'Immutable audit trail for registration events';

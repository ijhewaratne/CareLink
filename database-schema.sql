-- =============================================================================
-- CareLink - Document Storage Database Schema
-- =============================================================================
-- CRITICAL: This schema stores ONLY metadata, NEVER actual document content
-- Documents are stored in GCS/S3 with storageKey references
-- PDPA Compliance: PII encrypted at rest (nic_encrypted field)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Table: verification_documents
-- Stores metadata for uploaded verification documents
-- -----------------------------------------------------------------------------
CREATE TABLE verification_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Reference to user who uploaded
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Document type (NIC_FRONT, NIC_BACK, POLICE_CLEARANCE)
    document_type VARCHAR(50) NOT NULL CHECK (document_type IN ('NIC_FRONT', 'NIC_BACK', 'POLICE_CLEARANCE')),
    
    -- Cloud storage reference (NEVER the actual file content)
    storage_key VARCHAR(500) NOT NULL UNIQUE,
    
    -- Original filename (for reference only)
    original_name VARCHAR(255),
    
    -- File metadata
    mime_type VARCHAR(100) NOT NULL,
    file_size_bytes INTEGER NOT NULL CHECK (file_size_bytes > 0),
    
    -- Cloud provider info
    cloud_provider VARCHAR(10) NOT NULL DEFAULT 'gcs' CHECK (cloud_provider IN ('gcs', 's3')),
    bucket_name VARCHAR(255) NOT NULL,
    
    -- Verification status
    verification_status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (verification_status IN ('PENDING', 'APPROVED', 'REJECTED')),
    verified_by UUID REFERENCES admin_users(id),
    verified_at TIMESTAMP WITH TIME ZONE,
    rejection_reason TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Soft delete (for audit trail retention)
    deleted_at TIMESTAMP WITH TIME ZONE,
    deleted_by UUID REFERENCES admin_users(id),
    deletion_reason TEXT
);

-- Indexes for common queries
CREATE INDEX idx_verification_docs_user_id ON verification_documents(user_id);
CREATE INDEX idx_verification_docs_status ON verification_documents(verification_status);
CREATE INDEX idx_verification_docs_type ON verification_documents(document_type);
CREATE INDEX idx_verification_docs_created ON verification_documents(created_at);

-- -----------------------------------------------------------------------------
-- Table: users (extended with encrypted NIC)
-- -----------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS nic_encrypted TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS nic_masked VARCHAR(20);
ALTER TABLE users ADD COLUMN IF NOT EXISTS nic_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS nic_verified_at TIMESTAMP WITH TIME ZONE;

-- Index for NIC verification queries
CREATE INDEX idx_users_nic_verified ON users(nic_verified) WHERE nic_verified = TRUE;

-- -----------------------------------------------------------------------------
-- Table: document_access_logs
-- Audit trail for all document access (PDPA requirement)
-- -----------------------------------------------------------------------------
CREATE TABLE document_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Document accessed
    document_id UUID REFERENCES verification_documents(id),
    storage_key VARCHAR(500),
    
    -- User who accessed
    user_id UUID REFERENCES users(id),
    
    -- Action performed
    action VARCHAR(50) NOT NULL CHECK (action IN ('UPLOAD', 'VIEW', 'DELETE', 'VERIFY')),
    
    -- Request details
    ip_address INET,
    user_agent TEXT,
    
    -- For signed URL generation
    signed_url_generated BOOLEAN DEFAULT FALSE,
    signed_url_expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Result
    success BOOLEAN NOT NULL,
    error_message TEXT,
    
    -- Timestamp
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for audit queries
CREATE INDEX idx_doc_access_logs_document ON document_access_logs(document_id);
CREATE INDEX idx_doc_access_logs_user ON document_access_logs(user_id);
CREATE INDEX idx_doc_access_logs_action ON document_access_logs(action);
CREATE INDEX idx_doc_access_logs_created ON document_access_logs(created_at);

-- -----------------------------------------------------------------------------
-- Table: nic_decryption_logs
-- Special audit log for NIC decryption (highly sensitive)
-- -----------------------------------------------------------------------------
CREATE TABLE nic_decryption_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- User whose NIC was decrypted
    target_user_id UUID NOT NULL REFERENCES users(id),
    
    -- Admin who performed decryption
    decrypted_by UUID NOT NULL REFERENCES admin_users(id),
    
    -- Context
    reason VARCHAR(255) NOT NULL,
    
    -- Request details
    ip_address INET,
    user_agent TEXT,
    
    -- Result
    success BOOLEAN NOT NULL,
    error_message TEXT,
    
    -- Timestamp
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_nic_decrypt_target ON nic_decryption_logs(target_user_id);
CREATE INDEX idx_nic_decrypt_admin ON nic_decryption_logs(decrypted_by);
CREATE INDEX idx_nic_decrypt_created ON nic_decryption_logs(created_at);

-- -----------------------------------------------------------------------------
-- Views for common queries
-- -----------------------------------------------------------------------------

-- View: Pending verification documents
CREATE VIEW pending_verifications AS
SELECT 
    vd.id,
    vd.user_id,
    u.name as user_name,
    u.email as user_email,
    u.nic_masked,
    vd.document_type,
    vd.original_name,
    vd.file_size_bytes,
    vd.created_at,
    EXTRACT(DAY FROM CURRENT_TIMESTAMP - vd.created_at) as days_pending
FROM verification_documents vd
JOIN users u ON vd.user_id = u.id
WHERE vd.verification_status = 'PENDING'
AND vd.deleted_at IS NULL
ORDER BY vd.created_at ASC;

-- View: Document access summary (for audit reports)
CREATE VIEW document_access_summary AS
SELECT 
    DATE(created_at) as access_date,
    action,
    COUNT(*) as access_count,
    COUNT(DISTINCT user_id) as unique_users
FROM document_access_logs
GROUP BY DATE(created_at), action
ORDER BY access_date DESC, action;

-- -----------------------------------------------------------------------------
-- Functions and Triggers
-- -----------------------------------------------------------------------------

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_verification_docs_updated_at
    BEFORE UPDATE ON verification_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- -----------------------------------------------------------------------------
-- RLS (Row Level Security) Policies - PostgreSQL
-- -----------------------------------------------------------------------------

-- Enable RLS on tables
ALTER TABLE verification_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE nic_decryption_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own documents
CREATE POLICY user_own_documents ON verification_documents
    FOR SELECT
    USING (user_id = current_setting('app.current_user_id')::UUID);

-- Policy: Admins can see all documents
CREATE POLICY admin_all_documents ON verification_documents
    FOR ALL
    TO admin_role
    USING (true);

-- Policy: Only system can insert access logs
CREATE POLICY system_insert_logs ON document_access_logs
    FOR INSERT
    TO service_role
    WITH CHECK (true);

-- =============================================================================
-- SECURITY NOTES
-- =============================================================================
-- 1. NEVER store actual document content in these tables
-- 2. storage_key references files in GCS/S3 only
-- 3. nic_encrypted uses AES-256-GCM encryption
-- 4. All access is logged for PDPA compliance
-- 5. Soft delete preserves audit trail
-- 6. RLS policies enforce access control at database level
-- =============================================================================

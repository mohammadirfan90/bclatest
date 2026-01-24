-- =============================================================================
-- Banking Core - Audit Logs Table
-- Migration: 019_audit_logs.sql
-- Purpose: General audit logging for non-transaction system events
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    actor_id BIGINT,
    actor_type VARCHAR(20) NOT NULL COMMENT 'user, customer, system',
    actor_role VARCHAR(50),
    action_type VARCHAR(50) NOT NULL COMMENT 'ACCOUNT_CREATED, ACCOUNT_FROZEN, LOGIN, etc.',
    entity_type VARCHAR(50) NOT NULL COMMENT 'ACCOUNT, CUSTOMER, USER, SESSION',
    entity_id BIGINT,
    before_state JSON,
    after_state JSON,
    metadata JSON COMMENT 'IP address, user agent, etc.',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_actor (actor_id, actor_type),
    INDEX idx_audit_entity (entity_type, entity_id),
    INDEX idx_audit_action (action_type),
    INDEX idx_audit_created (created_at)
) ENGINE=InnoDB;

-- Verify creation
SELECT 'audit_logs table created successfully' AS status;

-- Migration: 017_fraud_detection_tables
-- Description: Creates tables for fraud detection queue and scoring

-- Fraud detection queue: Tracks transactions requiring review
CREATE TABLE IF NOT EXISTS fraud_queue (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    transaction_id BIGINT UNSIGNED NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    rule_triggered VARCHAR(100) NOT NULL,
    severity ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL,
    status ENUM('PENDING', 'REVIEWING', 'APPROVED', 'REJECTED', 'ESCALATED') NOT NULL DEFAULT 'PENDING',
    fraud_score INT UNSIGNED NOT NULL DEFAULT 0,
    details JSON NULL,
    assigned_to BIGINT UNSIGNED NULL,
    reviewed_at TIMESTAMP NULL,
    reviewed_by BIGINT UNSIGNED NULL,
    review_notes TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_fraud_transaction (transaction_id),
    KEY idx_fraud_customer (customer_id),
    KEY idx_fraud_status (status),
    KEY idx_fraud_severity (severity),
    KEY idx_fraud_assigned (assigned_to),
    CONSTRAINT fk_fraud_transaction FOREIGN KEY (transaction_id) REFERENCES transactions(id),
    CONSTRAINT fk_fraud_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT fk_fraud_assigned FOREIGN KEY (assigned_to) REFERENCES users(id),
    CONSTRAINT fk_fraud_reviewed FOREIGN KEY (reviewed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Fraud scores: Stores customer-level risk assessment
CREATE TABLE IF NOT EXISTS fraud_scores (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    customer_id BIGINT UNSIGNED NOT NULL,
    score INT UNSIGNED NOT NULL DEFAULT 0,
    risk_level ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'LOW',
    features JSON NULL,
    last_transaction_at TIMESTAMP NULL,
    last_calculated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_fraud_scores_customer (customer_id),
    KEY idx_fraud_scores_level (risk_level),
    CONSTRAINT fk_fraud_scores_customer FOREIGN KEY (customer_id) REFERENCES customers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

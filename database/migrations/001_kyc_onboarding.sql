-- Migration: 001_kyc_onboarding
-- Description: Schema updates for Customer Onboarding & KYC workflow

-- 1. Alter customers table
ALTER TABLE customers 
ADD COLUMN user_id BIGINT UNSIGNED NULL AFTER id,
ADD COLUMN kyc_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER kyc_status,
ADD CONSTRAINT fk_customers_user FOREIGN KEY (user_id) REFERENCES users(id);

-- 2. Create customer_kyc_requests table
CREATE TABLE IF NOT EXISTS customer_kyc_requests (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    customer_id BIGINT UNSIGNED NOT NULL,
    kyc_payload JSON NOT NULL,
    version INT UNSIGNED NOT NULL DEFAULT 1,
    status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    reviewed_by BIGINT UNSIGNED NULL,
    review_reason TEXT NULL,
    submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_kyc_req_customer (customer_id),
    KEY idx_kyc_req_status (status),
    CONSTRAINT fk_kyc_req_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT fk_kyc_req_reviewer FOREIGN KEY (reviewed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Create onboarding_tokens table
CREATE TABLE IF NOT EXISTS onboarding_tokens (
    token VARCHAR(64) NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (token),
    KEY idx_tokens_customer (customer_id),
    CONSTRAINT fk_tokens_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
    CONSTRAINT fk_tokens_creator FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

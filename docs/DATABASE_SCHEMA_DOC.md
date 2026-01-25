# Database Schema Documentation: Banking Core System

## 1. Introduction
The Banking Core system is designed as a robust, secure, and scalable financial platform. The database serves as the authoritative source for all financial records, user identities, and system configurations. Key design goals include ensuring transaction integrity via double-entry bookkeeping principles, maintaining detailed audit trails for regulatory compliance, and implementing a granular Role-Based Access Control (RBAC) system.

## 2. Database Overview
The system utilizes a relational model (MySQL) organized into several functional modules:
- **Identity & Access Management (IAM)**: Manages users, roles, and permissions.
- **Customer Relationship Management (CRM)**: Tracks customer profiles and KYC status.
- **Core Banking Operations**: Handles accounts, balances, and account types.
- **Transaction Engine**: Implements the double-entry ledger system.
- **System Integrity & Security**: Includes audit logs, idempotency management, and fraud detection.

### 2.1 Key Design Principles
- **Double-Entry Bookkeeping**: Every transaction is reflected in at least two ledger entries (Debit and Credit) to ensure balanced records.
- **Idempotency**: Prevents duplicate processing of the same transaction request using a unique key system.
- **Auditability**: Extensive logging of both financial transactions and administrative actions.

---

## 3. Table-wise Attribute Listing

### 3.1 Module: Identity & Access Management

#### Table: `roles`
**Description**: Defines system roles and their associated permission sets.
| Attribute | Data Type | Nullable | Default | Meaning |
|:---|:---|:---|:---|:---|
| `id` (PK) | BIGINT | No | Auto-inc | Unique identifier for the role |
| `code` | VARCHAR(50) | No | - | Short string code (e.g., ADMIN, BANKER) |
| `name` | VARCHAR(100) | No | - | Human-readable name |
| `description` | TEXT | Yes | NULL | Detailed role description |
| `permissions` | JSON | Yes | NULL | List of functional permissions |
| `is_system` | BOOLEAN | No | FALSE | Indicates if it's a protected system role |
| `created_at` | TIMESTAMP | Yes | CURRENT_TIMESTAMP | Record creation timestamp |

#### Table: `users`
**Description**: Stores administrative and staff user accounts.
| Attribute | Data Type | Nullable | Default | Meaning |
|:---|:---|:---|:---|:---|
| `id` (PK) | BIGINT | No | Auto-inc | Unique identifier for the user |
| `email` | VARCHAR(255) | No | - | Unique email address (login credential) |
| `password_hash` | VARCHAR(255) | No | - | Securely hashed password |
| `first_name` | VARCHAR(100) | No | - | User's first name |
| `last_name` | VARCHAR(100) | No | - | User's last name |
| `role_id` (FK) | BIGINT | No | - | Link to `roles.id` |
| `status` | VARCHAR(20) | Yes | 'ACTIVE' | Current account status (ACTIVE, INACTIVE) |
| `last_login_at` | TIMESTAMP | Yes | NULL | Timestamp of last successful login |

---

### 3.2 Module: Customer Relationship Management (CRM)

#### Table: `customers`
**Description**: Stores retail customer information and KYC (Know Your Customer) details.
| Attribute | Data Type | Nullable | Default | Meaning |
|:---|:---|:---|:---|:---|
| `id` (PK) | BIGINT | No | Auto-inc | Unique identifier for the customer |
| `customer_number` | VARCHAR(20) | No | - | Unique business ID for the customer |
| `email` | VARCHAR(255) | No | - | Customer's email address |
| `password_hash` | VARCHAR(255) | No | - | Hashed portal password |
| `first_name` | VARCHAR(100) | No | - | Customer's first name |
| `last_name` | VARCHAR(100) | No | - | Customer's last name |
| `phone` | VARCHAR(20) | Yes | NULL | Primary contact phone number |
| `national_id` | VARCHAR(50) | Yes | NULL | Government-issued ID number |
| `date_of_birth` | DATE | Yes | NULL | Date of birth for KYC |
| `status` | VARCHAR(20) | Yes | 'PENDING' | Account status (ACTIVE, PENDING, FROZEN) |
| `kyc_status` | VARCHAR(20) | Yes | 'PENDING' | KYC validation level |

---

### 3.3 Module: Core Banking Operations

#### Table: `account_types`
**Description**: Defines product specifications (e.g., Savings, Checking).
| Attribute | Data Type | Nullable | Default | Meaning |
|:---|:---|:---|:---|:---|
| `id` (PK) | BIGINT | No | Auto-inc | Unique identifier |
| `code` | VARCHAR(50) | No | - | Internal code (e.g., SAVINGS) |
| `name` | VARCHAR(100) | No | - | Display name |
| `min_balance` | DECIMAL(18,4) | Yes | 0 | Minimum balance requirement |
| `is_active` | BOOLEAN | No | TRUE | If this product is currently offered |

#### Table: `accounts`
**Description**: Individual customer financial accounts.
| Attribute | Data Type | Nullable | Default | Meaning |
|:---|:---|:---|:---|:---|
| `id` (PK) | BIGINT | No | Auto-inc | Unique internal ID |
| `account_number` | VARCHAR(20) | No | - | IBAN-style unique account number |
| `customer_id` (FK) | BIGINT | No | - | Link to `customers.id` |
| `account_type_id`(FK)| BIGINT | No | - | Link to `account_types.id` |
| `status` | VARCHAR(20) | Yes | 'PENDING' | Status (ACTIVE, CLOSED, etc.) |
| `opened_at` | TIMESTAMP | Yes | NULL | Date and time account was opened |
| `currency` | VARCHAR(3) | Yes | 'BDT' | ISO currency code |

#### Table: `account_balances`
**Description**: Real-time balance tracker for quick lookups.
| Attribute | Data Type | Nullable | Default | Meaning |
|:---|:---|:---|:---|:---|
| `account_id` (PK, FK)| BIGINT | No | - | Link to `accounts.id` |
| `available_balance` | DECIMAL(18,4) | No | 0 | Funds available for withdrawal |
| `version` | INT | Yes | 1 | Optimistic locking version |
| `updated_at` | TIMESTAMP | Yes | CURRENT_TIMESTAMP | Last update timestamp |

---

### 3.4 Module: Transaction Engine

#### Table: `transaction_types`
**Description**: Categories of financial movements.
| Attribute | Data Type | Nullable | Default | Meaning |
|:---|:---|:---|:---|:---|
| `id` (PK) | BIGINT | No | Auto-inc | Unique identifier |
| `code` | VARCHAR(50) | No | - | e.g., TRANSFER, DEPOSIT, WITHDRAWAL |

#### Table: `transactions`
**Description**: High-level record of a financial transaction event.
| Attribute | Data Type | Nullable | Default | Meaning |
|:---|:---|:---|:---|:---|
| `id` (PK) | BIGINT | No | Auto-inc | Internal transaction ID |
| `transaction_reference`| VARCHAR(50) | No | - | Unique business reference (UUID) |
| `transaction_type_id` | BIGINT | No | - | Link to `transaction_types.id` |
| `amount` | DECIMAL(18,4) | No | - | Magnitude of the transaction |
| `source_account_id` | BIGINT | Yes | NULL | Sender's account (if applicable) |
| `destination_account_id`| BIGINT | Yes | NULL | Receiver's account (if applicable) |
| `status` | VARCHAR(20) | Yes | 'PENDING' | Finality (COMPLETED, FAILED) |

#### Table: `ledger_entries`
**Description**: The granular double-entry records. Each transaction has multiple entries.
| Attribute | Data Type | Nullable | Default | Meaning |
|:---|:---|:---|:---|:---|
| `id` (PK) | BIGINT | No | Auto-inc | Entry ID |
| `transaction_id` (FK)| BIGINT | No | - | Link to parent `transactions.id` |
| `account_id` (FK) | BIGINT | No | - | Account affected by this entry |
| `entry_type` | VARCHAR(10) | No | - | DEBIT or CREDIT |
| `amount` | DECIMAL(18,4) | No | - | Amount of this specific entry |
| `balance_after` | DECIMAL(18,4) | No | - | Account balance after this entry |

---

### 3.5 Module: System Integrity & Security

#### Table: `audit_logs`
**Description**: Captures administrative and security events.
| Attribute | Data Type | Nullable | Default | Meaning |
|:---|:---|:---|:---|:---|
| `id` (PK) | BIGINT | No | Auto-inc | Log ID |
| `actor_id` | BIGINT | Yes | NULL | ID of the entity performing action |
| `actor_type` | VARCHAR(20) | No | - | Type (user, customer, system) |
| `action_type` | VARCHAR(50) | No | - | Event type (e.g., LOGIN, FROZEN) |
| `before_state` | JSON | Yes | NULL | Snapshot before change |
| `after_state` | JSON | Yes | NULL | Snapshot after change |

#### Table: `idempotency_keys`
**Description**: Ensures API requests are not processed more than once.
| Attribute | Data Type | Nullable | Default | Meaning |
|:---|:---|:---|:---|:---|
| `idempotency_key` (PK)| VARCHAR(64) | No | - | Unique request identifier |
| `response_status` | INT | Yes | NULL | Cached HTTP status code |
| `response_body` | JSON | Yes | NULL | Cached response JSON |
| `expires_at` | TIMESTAMP | Yes | NULL | When this key will be purged |

#### Table: `fraud_queue`
**Description**: Transactions flagged for manual review by auditors.
| Attribute | Data Type | Nullable | Default | Meaning |
|:---|:---|:---|:---|:---|
| `id` (PK) | BIGINT | No | Auto-inc | Queue entry ID |
| `transaction_id` (FK)| BIGINT | No | - | Flagged transaction |
| `severity` | ENUM | No | - | LOW, MEDIUM, HIGH, CRITICAL |
| `status` | ENUM | No | 'PENDING' | REVIEWING, APPROVED, REJECTED |
| `fraud_score` | INT | No | 0 | Risk assessment score |

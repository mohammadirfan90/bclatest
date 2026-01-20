# Architecture Design: Account Creation & Authentication System

As a senior backend architect, I have analyzed the current Banking Core database schema and existing service implementations. Below is the proposed design for a seamless account creation and authentication system.

## 1. Existing Schema Summary

| Table | Auth-Relevant Columns |
| :--- | :--- |
| **`users`** | `id`, `email`, `password_hash`, `role_id`, `status`, `last_login_at` |
| **`customers`** | `id`, `user_id`, `customer_number`, `email`, `password_hash`, `status`, `kyc_status` |
| **`roles`** | `id`, `code`, `name`, `permissions` (JSON) |
| **`onboarding_tokens`** | `token`, `customer_id`, `expires_at`, `used_at` |

## 2. Identified User/Account Representation

The system is architected as a **Dual-Identity Model**:
-   **Internal Users (Staff)**: Represented by the `users` table. Access is controlled by the `roles` table using RBAC.
-   **External Users (Customers)**: Represented by the `customers` table. While they have an `email` and `password_hash`, they are distinct from staff. The `user_id` in `customers` (added via migration) allows linking a customer record to a specific staff user who manages them.

## 3. Account Creation Field Mapping (Input → Database)

### Customer Registration (Self-Service or Invited)
- **First/Last Name** → `customers.first_name`, `customers.last_name`
- **Email** → `customers.email` (Unique Constraint)
- **Password** → `customers.password_hash` (Bcrypt-hashed)
- **Customer Number** → `customers.customer_number` (Unique, Business Logic generated)
- **Status** → Set to `'PENDING'` or `'ACTIVE'` based on workflow requirements.

### Staff Creation (Admin Managed)
- **Email** → `users.email` (Unique)
- **Role** → `users.role_id` (Looked up from `roles` table)
- **Status** → Set to `'ACTIVE'` by default.

## 4. Authentication Strategy

-   **Token-Based**: Stateless JWT (JSON Web Tokens) are stored in **HttpOnly, Secure cookies**.
-   **Polymorphic Discovery**: Authenticate against `users` first (for staff/admin login panels), then `customers` (for portal access).
-   **Session Integrity**: The Existing `getSession()` helper in `auth-service.ts` already extracts the `type` (user vs customer) from the JWT payload to reconstruct the correct identity object.

## 5. Authorization Strategy

-   **Staff RBAC**: Permissions are derived directly from the `roles.permissions` JSON column. Middleware like `withAuth` will check for specific strings (e.g., `transactions:create`).
-   **Customer Authorization**: Authorization is implicitly hardcoded to the `CUSTOMER` role. Permissions are resource-based: a customer can only access `accounts` where `customer_id` matches their own `sub` (Subject ID) from the JWT.

## 6. SQL Queries

### Logic for Registration (using `customers` table)
```sql
-- Create customer identity
INSERT INTO customers (customer_number, email, password_hash, first_name, last_name, status, created_by)
VALUES (?, ?, ?, ?, ?, 'PENDING', ?);

-- Create linked core record if strictly necessary per business logic
INSERT INTO accounts (account_number, customer_id, account_type_id, status)
VALUES (?, LAST_INSERT_ID(), (SELECT id FROM account_types WHERE code = 'SAVINGS'), 'PENDING');
```

### Logic for Login (Polymorphic Select)
```sql
-- Staff Path
SELECT u.id, u.password_hash, r.code as role_code, r.permissions
FROM users u JOIN roles r ON u.role_id = r.id
WHERE u.email = ? AND u.status = 'ACTIVE';

-- Customer Path
SELECT id, customer_number, password_hash, status
FROM customers
WHERE email = ? AND status IN ('ACTIVE', 'PENDING');
```

## 7. Backend API Contract

| Endpoint | Method | Input | Success Response |
| :--- | :--- | :--- | :--- |
| `/api/auth/login` | `POST` | `{ email, password, type: 'user'\|'customer' }` | `200 OK` (Set-Cookie) |
| `/api/auth/register` | `POST` | `{ email, password, firstName, lastName }` | `201 Created` |
| `/api/auth/me` | `GET` | (Cookie-based auth) | `{ user: { id, email, role, permissions } }` |

## 8. Risks & Limitations

1.  **Email Overlap**: A single email cannot currently be used for both a staff member and a customer due to duplicate entry constraints if not carefully managed. However, the system currently allows them to exist in separate tables, which could cause confusion in "Login" flows without a `type` hint.
2.  **Stateless Versioning**: There is no built-in `token_version` in the current schema to support "Logout from all devices". 

## 9. Minimal Additions (Optional)

1.  **`users.token_version` (BIGINT)**: Suggested to allow global session invalidation.
2.  **`customers.last_login_at` (TIMESTAMP)**: To track customer activity for security auditing (currently only exists on `users`).

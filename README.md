# Banking Core

**Production-Grade Core Banking System** — A double-entry ledger, accounting & reporting platform for BDT currency.

Built with **Next.js 16**, **shadcn/ui**, and **MySQL 8**.

## 🏦 Overview

Banking Core is a simplified, banker-driven core banking solution implementing:

- ✅ **True Double-Entry Accounting** — Every transaction balanced, append-only ledger
- ✅ **Stored-Procedure-Driven Money Movement** — All financial ops in MySQL transactions
- ✅ **Simplified Banker Workflow** — Direct customer onboarding and account creation
- ✅ **Ledger & Reporting** — Real-time transaction history and PDF statement export
- ✅ **Role-Based Access Control** — Customer and Banker dashboards
- ✅ **Password Management** — Secure customer password change on first login

> ⚠️ **Correctness > Convenience > Speed** — All design decisions prioritize financial integrity.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm (or pnpm)
- MySQL 8

### Installation

```bash
# Clone and install dependencies
npm install

# Copy environment template
# (Ensure your .env.local has DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, etc.)
```

### Database Setup

```bash
# Initialize the database and procedures
npm run db:reset
```

### Run Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000)

## 🔐 Demo Credentials

| Role | Email | Password | Login URL |
|------|-------|----------|-----------|
| Banker | banker1@bnkcore.com | Banker@123 | /internal/login |
| Auditor | auditor@bnkcore.com | password123 | /internal/login |
| Admin | admin@bnkcore.com | password123 | /internal/login |
| Customer | (Created by Banker) | (Generated at Creation) | /login |

## 📁 Project Structure

```
bnkcore/
├── database/
│   ├── schema/           # DDL scripts
│   ├── procedures/       # Stored procedures
│   └── seeds/            # Reference data
├── src/
│   ├── app/
│   │   ├── (auth)/       # Login & Auth logic
│   │   ├── banker/       # Banker dashboard
│   │   ├── auditor/      # Auditor portal (read-only)
│   │   ├── admin/        # Admin dashboard
│   │   ├── customer/     # Customer portal
│   │   └── api/v1/       # REST API endpoints
│   ├── components/       # UI Components (shadcn)
│   ├── lib/
│   │   ├── services/     # Business logic layer
│   │   └── validations/  # Zod validation schemas
```

## 🗄️ Database Schema

### Core Tables

| Category | Tables |
|----------|--------|
| Identity & Access | `users`, `customers`, `roles` |
| Customers & Accounts | `accounts`, `account_types` |
| Financial Core | `transactions`, `ledger_entries`, `account_balances`, `transaction_audit` |
| Audit & Compliance | `audit_logs` |

### Key Constraints

- All money stored as `DECIMAL(19,4)`
- Ledger entries are **append-only** (no UPDATE/DELETE)
- Currency locked to `BDT`
- Negative balances prevented at database level via stored procedures

## 🔧 Stored Procedures

All money movement happens through atomic stored procedures:

| Procedure | Description |
|-----------|-------------|
| `sp_transfer` | Account-to-account transfer |
| `sp_deposit` | External deposit / Cash-in |
| `sp_withdraw` | Cash withdrawal |

## 📡 Key API Endpoints

### Authentication
- `POST /api/v1/auth/login` — Unified login
- `POST /api/v1/customer/profile/password` — Password change

### Banker Operations
- `GET /api/v1/banker/customers` — List customers
- `POST /api/v1/banker/customers/create` — Onboard new customer
- `POST /api/v1/banker/accounts` — Open new account for customer
- `POST /api/v1/banker/deposits` — Process cash deposit

### Auditor Operations (Read-Only)
- `GET /api/v1/auditor/transactions` — View all system transactions
- `GET /api/v1/auditor/ledger` — View ledger entries
- `GET /api/v1/auditor/audit-logs` — View system audit logs
- `GET /api/v1/auditor/export-pdf/transactions` — Export transactions PDF
- `GET /api/v1/auditor/export-pdf/ledger` — Export ledger PDF
- `GET /api/v1/auditor/export-pdf/audit-logs` — Export audit logs PDF
- `GET /api/v1/auditor/export-pdf/daily-totals` — Export daily totals PDF
- `GET /api/v1/auditor/export-pdf/monthly-summary` — Export monthly summary PDF

### Customer Operations
- `GET /api/v1/accounts` — My accounts
- `POST /api/v1/transactions/transfer` — Send money
- `GET /api/v1/accounts/[id]/statement/pdf` — Export statement

## 🔒 Security

- JWT-based authentication
- bcrypt password hashing
- Banker-initiated onboarding for security
- Parameterized SQL queries to prevent injection
- Stored procedure validation for all financial limits

## 📜 License

MIT

---

Built with ❤️ for financial correctness.

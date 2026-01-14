# Banking Core

**Production-Grade Core Banking System** — A double-entry ledger, reconciliation & analytics platform for BDT currency.

Built with **Next.js 15**, **shadcn/ui**, and **MySQL 8**.

## 🏦 Overview

Banking Core is a complete core banking solution implementing:

- ✅ **True Double-Entry Accounting** — Every transaction balanced, append-only ledger
- ✅ **Stored-Procedure-Driven Money Movement** — All financial ops in MySQL transactions
- ✅ **Event Sourcing with Outbox Pattern** — Exactly-once delivery guarantee
- ✅ **Reconciliation Engine** — CSV import, auto-matching, manual resolution
- ✅ **Fraud Detection** — Rule-based scoring with manual review workflow
- ✅ **Account Approval Workflow** — Banker-controlled application and approval process
- ✅ **Role-Based Access Control** — Customer, Banker, Admin dashboards

> ⚠️ **Correctness > Convenience > Speed** — All design decisions prioritize financial integrity.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- pnpm
- MySQL 8 (local or Azure Flexible Server)

### Installation

```bash
# Clone and install dependencies
pnpm install

# Copy environment template
cp .env.example .env.local

# Edit .env.local with your database credentials
```

### Database Setup

```bash
# Option 1: Use the seed script (requires MySQL connection)
npx tsx scripts/seed-demo.ts

# Option 2: Run SQL files manually
mysql -u root -p < database/schema/init.sql
mysql -u root -p < database/seeds/reference-data.sql
mysql -u root -p < database/procedures/procedures.sql
```

### Run Development Server

```bash
pnpm dev
```

Visit [http://localhost:3000](http://localhost:3000)

## 🔐 Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@bankingcore.local | Admin@123 |
| Banker | banker@bankingcore.local | Banker@123 |
| Customer | customer@demo.local | Customer@123 |

## 📁 Project Structure

```
bnkcore/
├── database/
│   ├── schema/           # DDL scripts (init.sql)
│   ├── procedures/       # Stored procedures
│   ├── triggers/         # Audit triggers
│   └── seeds/            # Reference data
├── scripts/              # Utility scripts
├── src/
│   ├── app/
│   │   ├── (auth)/       # Login pages
│   │   ├── (customer)/   # Customer portal
│   │   ├── (banker)/     # Banker dashboard
│   │   ├── (admin)/      # Admin console
│   │   └── api/v1/       # REST API endpoints
│   ├── components/       # React components
│   ├── lib/
│   │   ├── services/     # Business logic
│   │   └── validations/  # Zod schemas
│   └── types/            # TypeScript definitions
```

## 🗄️ Database Schema

### Core Tables

| Category | Tables |
|----------|--------|
| Identity & Access | `roles`, `users`, `user_sessions` |
| Customers & Accounts | `customers`, `accounts`, `accounts_history`, `account_applications` |
| Financial Core | `transactions`, `ledger_entries`, `account_balances`, `transaction_audit` |
| Reliability | `events`, `outbox`, `idempotency_keys` |
| Reconciliation | `reconciliations`, `reconciliation_items` |
| Fraud & Risk | `fraud_queue`, `fraud_scores` |
| Analytics | `daily_account_totals`, `monthly_account_summaries` |

### Key Constraints

- All money stored as `DECIMAL(19,4)`
- Ledger entries are **append-only** (no UPDATE/DELETE)
- Currency locked to `BDT` via CHECK constraints
- Negative balances prevented at database level

## 🔧 Stored Procedures

All money movement happens through stored procedures:

| Procedure | Description |
|-----------|-------------|
| `sp_transfer` | Account-to-account transfer |
| `sp_deposit` | External deposit to account |
| `sp_withdraw` | Cash withdrawal from account |
| `sp_reverse_transaction` | Compensating transaction |
| `sp_post_monthly_interest` | Interest calculation |
| `sp_refresh_account_balances` | Rebuild materialized views |
| `sp_eod_process` | End-of-day settlement |

Each procedure:
- Uses `START TRANSACTION`
- Validates business rules
- Locks necessary rows with `SELECT ... FOR UPDATE`
- Inserts balanced ledger entries
- Updates materialized balances
- Emits events to outbox
- Commits or rollbacks safely

## 📡 API Endpoints

### Authentication
- `POST /api/v1/auth/login` — User/Customer login
- `POST /api/v1/auth/refresh` — Token refresh

### Customers
- `GET /api/v1/customers` — List customers (Banker+)
- `POST /api/v1/customers` — Create customer (Banker+)
- `GET /api/v1/customers/[id]` — Get customer details
- `PATCH /api/v1/customers/[id]` — Update customer

### Accounts
- `GET /api/v1/accounts` — List accounts
- `POST /api/v1/accounts/apply` — Apply for account (Customer)
- `GET /api/v1/accounts/[id]` — Get account details
- `PATCH /api/v1/accounts/[id]` — Update account status

### Banker Actions
- `GET /api/v1/banker/accounts/pending` — List pending applications
- `POST /api/v1/banker/accounts/[id]/approve` — Approve application
- `POST /api/v1/banker/accounts/[id]/reject` — Reject application
- `POST /api/v1/banker/accounts/[id]/freeze` — Freeze account
- `POST /api/v1/banker/accounts/[id]/unfreeze` — Unfreeze account
- `POST /api/v1/banker/accounts/[id]/close` — Close account

### Transactions
- `GET /api/v1/transactions` — List transactions
- `POST /api/v1/transactions/transfer` — Transfer money
- `POST /api/v1/transactions/deposit` — Cash deposit (Banker+)
- `POST /api/v1/transactions/withdraw` — Cash withdrawal (Banker+)

### Admin
- `GET /api/v1/admin/users` — List staff users
- `POST /api/v1/admin/users` — Create staff user
- `POST /api/v1/admin/eod` — Run EOD process

### Health
- `GET /api/v1/health` — System health check

## 🎨 UI Design

### Color Palette
- **Primary**: Slate (neutral, professional)
- **Accent**: Muted blue (trust, stability)
- **Success**: Soft green
- **Warning**: Amber
- **Error**: Muted red

### Role-Based UI
- **Customer**: Guided, minimal, focused on core actions
- **Banker**: Data-dense, operational efficiency
- **Admin**: Full system control, monitoring

## 🧪 Testing

```bash
# Type checking
pnpm tsc --noEmit

# Build
pnpm build

# Validation script
npx tsx scripts/verify-account-workflow.ts
```

## 🔒 Security Features

- JWT-based authentication with refresh tokens
- bcrypt password hashing (cost factor 12)
- Account lockout after failed attempts
- Role-based authorization on all endpoints
- Idempotency keys for mutation operations
- SQL injection prevention via parameterized queries

## 📜 License

MIT

---

Built with ❤️ for financial correctness.

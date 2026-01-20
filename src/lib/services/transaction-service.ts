/**
 * Banking Core - Transaction Service v1.0
 * Simplified service layer for stored procedure calls
 * 
 * Version: 1.0.0
 * Date: 2026-01-14
 * 
 * This service provides thin wrappers around stored procedures.
 * All business logic is in the database, not JavaScript.
 */

import { callProcedure, query, queryOne } from '../db';
import { RowDataPacket } from 'mysql2/promise';

// =============================================================================
// Types
// =============================================================================

export interface TransferRequest {
    fromAccountId: number;
    toAccountId: number;
    amount: number;
    description?: string;
    performedBy: number;
}

export interface DepositRequest {
    accountId: number;
    amount: number;
    description?: string;
    bankerId: number;
}

export interface WithdrawRequest {
    accountId: number;
    amount: number;
    description?: string;
    bankerId: number;
}

export interface TransactionResult {
    success: boolean;
    transactionId?: number;
    status: string;
    message: string;
}

export interface Transaction {
    id: number;
    transactionReference: string;
    transactionType: string;
    amount: number;
    currency: string;
    description: string | null;
    status: string;
    sourceAccountId: number | null;
    destinationAccountId: number | null;
    processedAt: Date | null;
    createdAt: Date;
}

export interface SearchTransactionResult {
    id: number;
    transactionReference: string;
    amount: number;
    currency: string;
    status: string;
    description: string | null;
    createdAt: Date;
    type: string;
    typeName: string;
    sourceAccount: string | null;
    destAccount: string | null;
    sourceOwner: string | null;
    destOwner: string | null;
    entryType: 'DEBIT' | 'CREDIT' | null;
}

export interface LedgerEntry {
    id: number;
    transactionId: number;
    accountId: number;
    entryType: 'DEBIT' | 'CREDIT';
    amount: number;
    currency: string;
    balanceAfter: number;
    description: string | null;
    entryDate: Date;
    createdAt: Date;
}

// =============================================================================
// Transfer (Customer or Banker)
// Calls sp_transfer stored procedure
// =============================================================================

export async function transfer(request: TransferRequest): Promise<TransactionResult> {
    const { outParams } = await callProcedure(
        'sp_transfer',
        [
            request.fromAccountId,
            request.toAccountId,
            request.amount,
            request.description || 'Fund Transfer',
            request.performedBy,
        ],
        ['p_transaction_id', 'p_status', 'p_message']
    );

    return {
        success: outParams.p_status === 'COMPLETED',
        transactionId: outParams.p_transaction_id as number | undefined,
        status: outParams.p_status as string,
        message: outParams.p_message as string,
    };
}

// =============================================================================
// Deposit (Banker only)
// Calls sp_deposit stored procedure
// =============================================================================

export async function deposit(request: DepositRequest): Promise<TransactionResult> {
    const { outParams } = await callProcedure(
        'sp_deposit',
        [
            request.accountId,
            request.amount,
            request.description || 'Cash Deposit',
            request.bankerId,
        ],
        ['p_transaction_id', 'p_status', 'p_message']
    );

    return {
        success: outParams.p_status === 'COMPLETED',
        transactionId: outParams.p_transaction_id as number | undefined,
        status: outParams.p_status as string,
        message: outParams.p_message as string,
    };
}

// =============================================================================
// Withdraw (Banker only)
// Calls sp_withdraw stored procedure
// =============================================================================

export async function withdraw(request: WithdrawRequest): Promise<TransactionResult> {
    const { outParams } = await callProcedure(
        'sp_withdraw',
        [
            request.accountId,
            request.amount,
            request.description || 'Cash Withdrawal',
            request.bankerId,
        ],
        ['p_transaction_id', 'p_status', 'p_message']
    );

    return {
        success: outParams.p_status === 'COMPLETED',
        transactionId: outParams.p_transaction_id as number | undefined,
        status: outParams.p_status as string,
        message: outParams.p_message as string,
    };
}

// =============================================================================
// Rebuild Balance (Admin only)
// Calls sp_rebuild_balance stored procedure
// =============================================================================

export async function rebuildBalance(accountId: number): Promise<{
    success: boolean;
    oldBalance: number;
    newBalance: number;
    status: string;
    message: string;
}> {
    const { outParams } = await callProcedure(
        'sp_rebuild_balance',
        [accountId],
        ['p_old_balance', 'p_new_balance', 'p_status', 'p_message']
    );

    return {
        success: outParams.p_status === 'COMPLETED',
        oldBalance: parseFloat(outParams.p_old_balance as string) || 0,
        newBalance: parseFloat(outParams.p_new_balance as string) || 0,
        status: outParams.p_status as string,
        message: outParams.p_message as string,
    };
}

// =============================================================================
// Query Transactions
// =============================================================================

interface TransactionRow extends RowDataPacket {
    id: number;
    transaction_reference: string;
    transaction_type: string;
    amount: string;
    currency: string;
    description: string | null;
    status: string;
    source_account_id: number | null;
    destination_account_id: number | null;
    processed_at: Date | null;
    created_at: Date;
}

export async function getTransactionById(transactionId: number): Promise<Transaction | null> {
    const row = await queryOne<TransactionRow>(
        `SELECT t.id, t.transaction_reference, tt.code as transaction_type,
            t.amount, t.currency, t.description, t.status,
            t.source_account_id, t.destination_account_id,
            t.processed_at, t.created_at
         FROM transactions t
         INNER JOIN transaction_types tt ON tt.id = t.transaction_type_id
         WHERE t.id = ?`,
        [transactionId]
    );

    if (!row) return null;

    return mapTransactionRow(row);
}

export async function getTransactionsForAccount(
    accountId: number,
    options: {
        limit?: number;
        offset?: number;
        startDate?: Date;
        endDate?: Date;
    } = {}
): Promise<{ transactions: Transaction[]; total: number }> {
    const { limit = 50, offset = 0, startDate, endDate } = options;

    const conditions: string[] = ['(t.source_account_id = ? OR t.destination_account_id = ?)'];
    const params: unknown[] = [accountId, accountId];

    if (startDate) {
        conditions.push('t.created_at >= ?');
        params.push(startDate);
    }

    if (endDate) {
        conditions.push('t.created_at <= ?');
        params.push(endDate);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    interface CountRow extends RowDataPacket {
        count: number;
    }
    const countRow = await queryOne<CountRow>(
        `SELECT COUNT(*) as count
         FROM transactions t
         WHERE ${whereClause}`,
        params
    );

    // Get transactions
    const rows = await query<TransactionRow[]>(
        `SELECT t.id, t.transaction_reference, tt.code as transaction_type,
            t.amount, t.currency, t.description, t.status,
            t.source_account_id, t.destination_account_id,
            t.processed_at, t.created_at
         FROM transactions t
         INNER JOIN transaction_types tt ON tt.id = t.transaction_type_id
         WHERE ${whereClause}
         ORDER BY t.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );

    return {
        transactions: rows.map(mapTransactionRow),
        total: countRow?.count || 0,
    };
}

// Get all transactions (for auditor/admin)
export async function getAllTransactions(
    options: {
        limit?: number;
        offset?: number;
        startDate?: Date;
        endDate?: Date;
        status?: string;
        transactionType?: string;
    } = {}
): Promise<{ transactions: Transaction[]; total: number }> {
    const { limit = 50, offset = 0, startDate, endDate, status, transactionType } = options;

    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];

    if (startDate) {
        conditions.push('t.created_at >= ?');
        params.push(startDate);
    }

    if (endDate) {
        conditions.push('t.created_at <= ?');
        params.push(endDate);
    }

    if (status) {
        conditions.push('t.status = ?');
        params.push(status);
    }

    if (transactionType) {
        conditions.push('tt.code = ?');
        params.push(transactionType);
    }

    const whereClause = conditions.join(' AND ');

    interface CountRow extends RowDataPacket {
        count: number;
    }
    const countRow = await queryOne<CountRow>(
        `SELECT COUNT(*) as count
         FROM transactions t
         INNER JOIN transaction_types tt ON tt.id = t.transaction_type_id
         WHERE ${whereClause}`,
        params
    );

    const rows = await query<TransactionRow[]>(
        `SELECT t.id, t.transaction_reference, tt.code as transaction_type,
            t.amount, t.currency, t.description, t.status,
            t.source_account_id, t.destination_account_id,
            t.processed_at, t.created_at
         FROM transactions t
         INNER JOIN transaction_types tt ON tt.id = t.transaction_type_id
         WHERE ${whereClause}
         ORDER BY t.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );

    return {
        transactions: rows.map(mapTransactionRow),
        total: countRow?.count || 0,
    };
}

export async function searchTransactions(
    options: {
        limit?: number;
        offset?: number;
        accountId?: number;
        accountNumber?: string;
        transactionReference?: string;
        entryType?: 'DEBIT' | 'CREDIT';
        startDate?: string;
        endDate?: string;
        status?: string;
        type?: string;
    } = {}
): Promise<{ transactions: SearchTransactionResult[]; total: number }> {
    const {
        limit = 50,
        offset = 0,
        accountId,
        accountNumber,
        transactionReference,
        entryType,
        startDate,
        endDate,
        status,
        type
    } = options;

    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];

    if (accountId) {
        conditions.push('(t.source_account_id = ? OR t.destination_account_id = ?)');
        params.push(accountId, accountId);
    }

    if (accountNumber) {
        conditions.push('(sa.account_number = ? OR da.account_number = ?)');
        params.push(accountNumber, accountNumber);
    }

    if (transactionReference) {
        conditions.push('t.transaction_reference = ?');
        params.push(transactionReference);
    }

    if (entryType) {
        conditions.push('le.entry_type = ?');
        params.push(entryType);
    }

    if (startDate) {
        conditions.push('t.created_at >= ?');
        params.push(startDate);
    }

    if (endDate) {
        conditions.push('t.created_at <= ?');
        params.push(endDate + ' 23:59:59');
    }

    if (status) {
        conditions.push('t.status = ?');
        params.push(status);
    }

    if (type) {
        conditions.push('tt.code = ?');
        params.push(type);
    }

    const whereClause = conditions.join(' AND ');

    let joinClause = `
        INNER JOIN transaction_types tt ON t.transaction_type_id = tt.id
        LEFT JOIN accounts sa ON t.source_account_id = sa.id
        LEFT JOIN accounts da ON t.destination_account_id = da.id
        LEFT JOIN customers c_source ON sa.customer_id = c_source.id
        LEFT JOIN customers c_dest ON da.customer_id = c_dest.id
    `;

    if (entryType) {
        joinClause += ` INNER JOIN ledger_entries le ON le.transaction_id = t.id `;
    } else {
        joinClause += ` LEFT JOIN ledger_entries le ON le.transaction_id = t.id `;
    }

    const countRow = await queryOne<{ total: number } & RowDataPacket>(
        `SELECT COUNT(DISTINCT t.id) as total 
         FROM transactions t
         ${joinClause}
         WHERE ${whereClause}`,
        params
    );

    const rows = await query<RowDataPacket[]>(
        `SELECT DISTINCT t.id, t.transaction_reference, t.amount, t.currency, t.status, t.description, t.created_at,
                tt.code as type, tt.name as type_name,
                sa.account_number as source_account,
                da.account_number as dest_account,
                CONCAT(c_source.first_name, ' ', c_source.last_name) as source_owner,
                CONCAT(c_dest.first_name, ' ', c_dest.last_name) as dest_owner
         FROM transactions t
         ${joinClause}
         WHERE ${whereClause}
         ORDER BY t.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );

    return {
        transactions: rows.map(row => ({
            id: row.id,
            transactionReference: row.transaction_reference,
            amount: parseFloat(row.amount),
            currency: row.currency,
            status: row.status,
            description: row.description,
            createdAt: row.created_at,
            type: row.type,
            typeName: row.type_name,
            sourceAccount: row.source_account,
            destAccount: row.dest_account,
            sourceOwner: row.source_owner,
            destOwner: row.dest_owner,
            entryType: entryType || null
        })),
        total: countRow?.total || 0,
    };
}

// =============================================================================
// Ledger Entries
// =============================================================================

interface LedgerRow extends RowDataPacket {
    id: number;
    transaction_id: number;
    account_id: number;
    entry_type: 'DEBIT' | 'CREDIT';
    amount: string;
    currency: string;
    balance_after: string;
    description: string | null;
    entry_date: Date;
    created_at: Date;
}

export async function getLedgerEntriesForAccount(
    accountId: number,
    options: {
        limit?: number;
        offset?: number;
        startDate?: Date;
        endDate?: Date;
    } = {}
): Promise<{ entries: LedgerEntry[]; total: number }> {
    const { limit = 50, offset = 0, startDate, endDate } = options;

    const conditions: string[] = ['account_id = ?'];
    const params: unknown[] = [accountId];

    if (startDate) {
        conditions.push('entry_date >= ?');
        params.push(startDate);
    }

    if (endDate) {
        conditions.push('entry_date <= ?');
        params.push(endDate);
    }

    const whereClause = conditions.join(' AND ');

    interface CountRow extends RowDataPacket {
        count: number;
    }
    const countRow = await queryOne<CountRow>(
        `SELECT COUNT(*) as count FROM ledger_entries WHERE ${whereClause}`,
        params
    );

    const rows = await query<LedgerRow[]>(
        `SELECT id, transaction_id, account_id, entry_type, amount, currency,
            balance_after, description, entry_date, created_at
         FROM ledger_entries
         WHERE ${whereClause}
         ORDER BY created_at DESC, id DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );

    return {
        entries: rows.map(mapLedgerRow),
        total: countRow?.count || 0,
    };
}

// Get all ledger entries (for banker/auditor)
export async function getAllLedgerEntries(
    options: {
        limit?: number;
        offset?: number;
        accountId?: number;
        entryType?: 'DEBIT' | 'CREDIT';
        startDate?: Date;
        endDate?: Date;
    } = {}
): Promise<{ entries: (LedgerEntry & { accountNumber: string; transactionReference: string })[]; total: number }> {
    const { limit = 50, offset = 0, accountId, entryType, startDate, endDate } = options;

    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];

    if (accountId) {
        conditions.push('le.account_id = ?');
        params.push(accountId);
    }

    if (entryType) {
        conditions.push('le.entry_type = ?');
        params.push(entryType);
    }

    if (startDate) {
        conditions.push('le.entry_date >= ?');
        params.push(startDate);
    }

    if (endDate) {
        conditions.push('le.entry_date <= ?');
        params.push(endDate);
    }

    const whereClause = conditions.join(' AND ');

    interface CountRow extends RowDataPacket {
        count: number;
    }
    const countRow = await queryOne<CountRow>(
        `SELECT COUNT(*) as count FROM ledger_entries le WHERE ${whereClause}`,
        params
    );

    interface EnrichedLedgerRow extends LedgerRow {
        account_number: string;
        transaction_reference: string;
    }

    const rows = await query<EnrichedLedgerRow[]>(
        `SELECT le.id, le.transaction_id, le.account_id, le.entry_type, le.amount, le.currency,
                le.balance_after, le.description, le.entry_date, le.created_at,
                a.account_number, t.transaction_reference
         FROM ledger_entries le
         JOIN accounts a ON le.account_id = a.id
         JOIN transactions t ON le.transaction_id = t.id
         WHERE ${whereClause}
         ORDER BY le.created_at DESC, le.id DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );

    return {
        entries: rows.map((row) => ({
            ...mapLedgerRow(row),
            accountNumber: row.account_number,
            transactionReference: row.transaction_reference,
        })),
        total: countRow?.count || 0,
    };
}

// =============================================================================
// Audit Trail
// =============================================================================

interface AuditRow extends RowDataPacket {
    id: number;
    ledger_entry_id: number;
    transaction_id: number;
    account_id: number;
    entry_type: 'DEBIT' | 'CREDIT';
    amount: string;
    balance_after: string;
    audit_timestamp: Date;
}

export interface AuditEntry {
    id: number;
    ledgerEntryId: number;
    transactionId: number;
    accountId: number;
    entryType: 'DEBIT' | 'CREDIT';
    amount: number;
    balanceAfter: number;
    auditTimestamp: Date;
}

export async function getAuditTrail(
    options: {
        limit?: number;
        offset?: number;
        accountId?: number;
        startDate?: Date;
        endDate?: Date;
    } = {}
): Promise<{ entries: AuditEntry[]; total: number }> {
    const { limit = 50, offset = 0, accountId, startDate, endDate } = options;

    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];

    if (accountId) {
        conditions.push('account_id = ?');
        params.push(accountId);
    }

    if (startDate) {
        conditions.push('audit_timestamp >= ?');
        params.push(startDate);
    }

    if (endDate) {
        conditions.push('audit_timestamp <= ?');
        params.push(endDate);
    }

    const whereClause = conditions.join(' AND ');

    interface CountRow extends RowDataPacket {
        count: number;
    }
    const countRow = await queryOne<CountRow>(
        `SELECT COUNT(*) as count FROM transaction_audit WHERE ${whereClause}`,
        params
    );

    const rows = await query<AuditRow[]>(
        `SELECT id, ledger_entry_id, transaction_id, account_id, entry_type, 
                amount, balance_after, audit_timestamp
         FROM transaction_audit
         WHERE ${whereClause}
         ORDER BY audit_timestamp DESC, id DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );

    return {
        entries: rows.map((row) => ({
            id: row.id,
            ledgerEntryId: row.ledger_entry_id,
            transactionId: row.transaction_id,
            accountId: row.account_id,
            entryType: row.entry_type,
            amount: parseFloat(row.amount),
            balanceAfter: parseFloat(row.balance_after),
            auditTimestamp: row.audit_timestamp,
        })),
        total: countRow?.count || 0,
    };
}

// =============================================================================
// Verification Queries (for Admin/Auditor)
// =============================================================================

export async function verifyDoubleEntry(): Promise<{
    valid: boolean;
    discrepancy: number;
}> {
    interface SumRow extends RowDataPacket {
        total_debits: string;
        total_credits: string;
    }

    const row = await queryOne<SumRow>(
        `SELECT 
           COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END), 0) as total_debits,
           COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0) as total_credits
         FROM ledger_entries`
    );

    const totalDebits = parseFloat(row?.total_debits || '0');
    const totalCredits = parseFloat(row?.total_credits || '0');
    const discrepancy = Math.abs(totalDebits - totalCredits);

    return {
        valid: discrepancy < 0.0001,
        discrepancy,
    };
}

export async function verifyBalanceIntegrity(): Promise<{
    valid: boolean;
    discrepancies: { accountId: number; materialized: number; calculated: number }[];
}> {
    interface DiscrepancyRow extends RowDataPacket {
        account_id: number;
        materialized: string;
        calculated: string;
    }

    const rows = await query<DiscrepancyRow[]>(
        `SELECT 
           ab.account_id,
           ab.available_balance AS materialized,
           COALESCE(
             (SELECT SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE -amount END)
              FROM ledger_entries WHERE account_id = ab.account_id), 0
           ) AS calculated
         FROM account_balances ab
         HAVING ABS(materialized - calculated) > 0.0001`
    );

    return {
        valid: rows.length === 0,
        discrepancies: rows.map((row) => ({
            accountId: row.account_id,
            materialized: parseFloat(row.materialized),
            calculated: parseFloat(row.calculated),
        })),
    };
}

// =============================================================================
// Helper Functions
// =============================================================================

function mapTransactionRow(row: TransactionRow): Transaction {
    return {
        id: row.id,
        transactionReference: row.transaction_reference,
        transactionType: row.transaction_type,
        amount: parseFloat(row.amount),
        currency: row.currency,
        description: row.description,
        status: row.status,
        sourceAccountId: row.source_account_id,
        destinationAccountId: row.destination_account_id,
        processedAt: row.processed_at,
        createdAt: row.created_at,
    };
}

function mapLedgerRow(row: LedgerRow): LedgerEntry {
    return {
        id: row.id,
        transactionId: row.transaction_id,
        accountId: row.account_id,
        entryType: row.entry_type,
        amount: parseFloat(row.amount),
        currency: row.currency,
        balanceAfter: parseFloat(row.balance_after),
        description: row.description,
        entryDate: row.entry_date,
        createdAt: row.created_at,
    };
}

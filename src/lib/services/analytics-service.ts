/**
 * Analytics Service
 * Feature 15: Financial Analytics, Management Reports & Materialized Aggregates
 * 
 * Provides functions to query analytics tables and trigger aggregate generation.
 * Analytics data is derived from the ledger and must never be treated as source of truth.
 */

import { query, queryOne, execute } from '../db';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

// =============================================================================
// Types
// =============================================================================

export interface DailyTotal {
    id: number;
    accountId: number;
    accountNumber: string;
    customerName: string;
    date: string;
    openingBalance: number;
    closingBalance: number;
    totalDebits: number;
    totalCredits: number;
    debitCount: number;
    creditCount: number;
}

export interface MonthlySummary {
    id: number;
    accountId: number;
    accountNumber: string;
    customerName: string;
    year: number;
    month: number;
    openingBalance: number;
    closingBalance: number;
    totalDebits: number;
    totalCredits: number;
    debitCount: number;
    creditCount: number;
    avgDailyBalance: number;
    interestEarned: number;
    feesCharged: number;
}

export interface DailyTransactionSummary {
    date: string;
    totalDeposits: number;
    totalWithdrawals: number;
    transactionCount: number;
    volume: number;
}

export interface TopAccount {
    rank: number;
    accountId: number;
    accountNumber: string;
    customerName: string;
    category: 'HIGHEST_BALANCE' | 'MOST_TRANSACTIONS' | 'HIGHEST_VOLUME';
    metricValue: number;
}

export interface SystemTotals {
    totalAccounts: number;
    totalActiveAccounts: number;
    totalVolume: number;
    totalDeposits: number;
    totalWithdrawals: number;
    totalTransactions: number;
    avgAccountBalance: number;
}

export interface AggregateGenerationResult {
    accountsProcessed: number;
    status: string;
    message: string;
}

export interface RebuildResult {
    dailyRows: number;
    monthlyRows: number;
    status: string;
    message: string;
}

// =============================================================================
// Row Types
// =============================================================================

interface DailyTotalRow extends RowDataPacket {
    id: number;
    account_id: number;
    account_number: string;
    customer_name: string;
    date: Date;
    opening_balance: string;
    closing_balance: string;
    total_debits: string;
    total_credits: string;
    debit_count: number;
    credit_count: number;
}

interface MonthlySummaryRow extends RowDataPacket {
    id: number;
    account_id: number;
    account_number: string;
    customer_name: string;
    year: number;
    month: number;
    opening_balance: string;
    closing_balance: string;
    total_debits: string;
    total_credits: string;
    debit_count: number;
    credit_count: number;
    avg_daily_balance: string;
    interest_earned: string;
    fees_charged: string;
}

interface TopAccountRow extends RowDataPacket {
    rank_position: number;
    account_id: number;
    account_number: string;
    customer_name: string;
    category: 'HIGHEST_BALANCE' | 'MOST_TRANSACTIONS' | 'HIGHEST_VOLUME';
    metric_value: string;
}

interface SystemTotalsRow extends RowDataPacket {
    total_accounts: number;
    total_active_accounts: number;
    total_volume: string;
    total_deposits: string;
    total_withdrawals: string;
    total_transactions: number;
    avg_account_balance: string;
}

// =============================================================================
// Daily Totals
// =============================================================================

/**
 * Get daily totals for a specific date
 */
export async function getDailyTotals(
    date: string,
    options: { accountId?: number; page?: number; size?: number } = {}
): Promise<{ totals: DailyTotal[]; total: number }> {
    const { accountId, page = 1, size = 50 } = options;
    const offset = (page - 1) * size;

    let whereClause = 'WHERE le.entry_date = ?';
    const params: (string | number)[] = [date];

    if (accountId) {
        whereClause += ' AND le.account_id = ?';
        params.push(accountId);
    }

    // Get count of accounts with activity
    const countResult = await queryOne<{ count: number } & RowDataPacket>(
        `SELECT COUNT(DISTINCT le.account_id) as count 
         FROM ledger_entries le 
         ${whereClause}`,
        params
    );

    // Get ledger-based daily totals per account
    // This is computationally more expensive but adheres to the non-negotiable rule
    const rows = await query<RowDataPacket[]>(
        `SELECT 
            le.account_id, 
            a.account_number,
            CONCAT(c.first_name, ' ', c.last_name) as customer_name,
            SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE 0 END) as total_credits,
            SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END) as total_debits,
            COUNT(CASE WHEN le.entry_type = 'CREDIT' THEN 1 END) as credit_count,
            COUNT(CASE WHEN le.entry_type = 'DEBIT' THEN 1 END) as debit_count,
            -- Opening balance: balance_after - amount of the first entry of the day
            (SELECT l1.balance_after - l1.amount 
             FROM ledger_entries l1 
             WHERE l1.account_id = le.account_id AND l1.entry_date = ? 
             ORDER BY l1.id ASC LIMIT 1) as opening_balance,
            -- Closing balance: balance_after of the last entry of the day
            (SELECT l2.balance_after 
             FROM ledger_entries l2 
             WHERE l2.account_id = le.account_id AND l2.entry_date = ? 
             ORDER BY l2.id DESC LIMIT 1) as closing_balance
         FROM ledger_entries le
         INNER JOIN accounts a ON a.id = le.account_id
         INNER JOIN customers c ON c.id = a.customer_id
         ${whereClause}
         GROUP BY le.account_id, a.account_number, customer_name
         ORDER BY closing_balance DESC
         LIMIT ? OFFSET ?`,
        [date, date, ...params, size, offset]
    );

    return {
        totals: rows.map(row => ({
            id: row.account_id, // Use account_id as unique ID for the row
            accountId: row.account_id,
            accountNumber: row.account_number,
            customerName: row.customer_name,
            date: date,
            openingBalance: parseFloat(row.opening_balance || '0'),
            closingBalance: parseFloat(row.closing_balance || '0'),
            totalDebits: parseFloat(row.total_debits || '0'),
            totalCredits: parseFloat(row.total_credits || '0'),
            debitCount: row.debit_count,
            creditCount: row.credit_count,
        })),
        total: countResult?.count || 0,
    };
}

/**
 * Get system-wide totals for a specific date
 */
export async function getDailySystemTotals(date: string): Promise<SystemTotals> {
    const row = await queryOne<RowDataPacket>(
        `SELECT 
            COUNT(DISTINCT le.account_id) as total_accounts,
            COALESCE(SUM(le.amount), 0) as total_volume,
            COALESCE(SUM(CASE WHEN le.entry_type = 'CREDIT' THEN le.amount ELSE 0 END), 0) as total_deposits,
            COALESCE(SUM(CASE WHEN le.entry_type = 'DEBIT' THEN le.amount ELSE 0 END), 0) as total_withdrawals,
            COUNT(DISTINCT le.transaction_id) as total_transactions,
            -- For lack of precomputed data, we average the closing balances of all accounts with activity today
            COALESCE((
                SELECT AVG(closing_balance) FROM (
                    SELECT MAX(l2.balance_after) as closing_balance
                    FROM ledger_entries l2
                    WHERE l2.entry_date = ?
                    GROUP BY l2.account_id
                ) as daily_averages
            ), 0) as avg_account_balance
         FROM ledger_entries le
         WHERE le.entry_date = ?`,
        [date, date]
    );

    return {
        totalAccounts: row?.total_accounts || 0,
        totalActiveAccounts: row?.total_accounts || 0, // Simplified since we only know active ones today
        totalVolume: parseFloat(row?.total_volume || '0'),
        totalDeposits: parseFloat(row?.total_deposits || '0'),
        totalWithdrawals: parseFloat(row?.total_withdrawals || '0'),
        totalTransactions: row?.total_transactions || 0,
        avgAccountBalance: parseFloat(row?.avg_account_balance || '0'),
    };
}

/**
 * Get daily transaction summary directly from ledger_entries
 * ADHERES TO NON-NEGOTIABLE RULE: Compute on-the-fly from ledger_entries
 */
export async function getDailyTransactionSummary(date: string): Promise<DailyTransactionSummary> {
    const row = await queryOne<RowDataPacket>(
        `SELECT 
            COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0) as total_deposits,
            COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END), 0) as total_withdrawals,
            COUNT(DISTINCT transaction_id) as transaction_count,
            COALESCE(SUM(amount), 0) as volume
         FROM ledger_entries
         WHERE entry_date = ?`,
        [date]
    );

    const result = {
        date,
        totalDeposits: parseFloat(row?.total_deposits || '0'),
        totalWithdrawals: parseFloat(row?.total_withdrawals || '0'),
        transactionCount: row?.transaction_count || 0,
        volume: parseFloat(row?.volume || '0'),
    };

    return result;
}

// =============================================================================
// Monthly Summaries
// =============================================================================

/**
 * Get monthly summaries for a specific month
 */
export async function getMonthlySummaries(
    year: number,
    month: number,
    options: { accountId?: number; page?: number; size?: number } = {}
): Promise<{ summaries: MonthlySummary[]; total: number }> {
    const { accountId, page = 1, size = 50 } = options;
    const offset = (page - 1) * size;

    let whereClause = 'WHERE mas.year = ? AND mas.month = ?';
    const params: (number)[] = [year, month];

    if (accountId) {
        whereClause += ' AND mas.account_id = ?';
        params.push(accountId);
    }

    // Get count
    const countResult = await queryOne<{ count: number } & RowDataPacket>(
        `SELECT COUNT(*) as count 
         FROM monthly_account_summaries mas 
         ${whereClause}`,
        params
    );

    // Get data
    const rows = await query<MonthlySummaryRow[]>(
        `SELECT mas.id, mas.account_id, a.account_number,
                CONCAT(c.first_name, ' ', c.last_name) as customer_name,
                mas.year, mas.month, mas.opening_balance, mas.closing_balance,
                mas.total_debits, mas.total_credits,
                mas.debit_count, mas.credit_count,
                mas.avg_daily_balance, mas.interest_earned, mas.fees_charged
         FROM monthly_account_summaries mas
         INNER JOIN accounts a ON a.id = mas.account_id
         INNER JOIN customers c ON c.id = a.customer_id
         ${whereClause}
         ORDER BY mas.closing_balance DESC
         LIMIT ? OFFSET ?`,
        [...params, size, offset]
    );

    return {
        summaries: rows.map(row => ({
            id: row.id,
            accountId: row.account_id,
            accountNumber: row.account_number,
            customerName: row.customer_name,
            year: row.year,
            month: row.month,
            openingBalance: parseFloat(row.opening_balance),
            closingBalance: parseFloat(row.closing_balance),
            totalDebits: parseFloat(row.total_debits),
            totalCredits: parseFloat(row.total_credits),
            debitCount: row.debit_count,
            creditCount: row.credit_count,
            avgDailyBalance: parseFloat(row.avg_daily_balance),
            interestEarned: parseFloat(row.interest_earned),
            feesCharged: parseFloat(row.fees_charged),
        })),
        total: countResult?.count || 0,
    };
}

/**
 * Get system-wide totals for a specific month
 */
export async function getMonthlySystemTotals(year: number, month: number): Promise<SystemTotals> {
    const row = await queryOne<SystemTotalsRow>(
        `SELECT 
            COUNT(DISTINCT mas.account_id) as total_accounts,
            COUNT(DISTINCT CASE WHEN a.status = 'ACTIVE' THEN a.id END) as total_active_accounts,
            COALESCE(SUM(mas.total_debits + mas.total_credits), 0) as total_volume,
            COALESCE(SUM(mas.total_credits), 0) as total_deposits,
            COALESCE(SUM(mas.total_debits), 0) as total_withdrawals,
            COALESCE(SUM(mas.debit_count + mas.credit_count), 0) as total_transactions,
            COALESCE(AVG(mas.avg_daily_balance), 0) as avg_account_balance
         FROM monthly_account_summaries mas
         INNER JOIN accounts a ON a.id = mas.account_id
         WHERE mas.year = ? AND mas.month = ?`,
        [year, month]
    );

    return {
        totalAccounts: row?.total_accounts || 0,
        totalActiveAccounts: row?.total_active_accounts || 0,
        totalVolume: parseFloat(row?.total_volume || '0'),
        totalDeposits: parseFloat(row?.total_deposits || '0'),
        totalWithdrawals: parseFloat(row?.total_withdrawals || '0'),
        totalTransactions: row?.total_transactions || 0,
        avgAccountBalance: parseFloat(row?.avg_account_balance || '0'),
    };
}

// =============================================================================
// Top Accounts
// =============================================================================

/**
 * Get top accounts for a specific month and category
 */
export async function getTopAccounts(
    year: number,
    month: number,
    category?: 'HIGHEST_BALANCE' | 'MOST_TRANSACTIONS' | 'HIGHEST_VOLUME'
): Promise<TopAccount[]> {
    let whereClause = 'WHERE tam.year = ? AND tam.month = ?';
    const params: (number | string)[] = [year, month];

    if (category) {
        whereClause += ' AND tam.category = ?';
        params.push(category);
    }

    const rows = await query<TopAccountRow[]>(
        `SELECT tam.rank_position, tam.account_id, a.account_number,
                CONCAT(c.first_name, ' ', c.last_name) as customer_name,
                tam.category, tam.metric_value
         FROM top_accounts_monthly tam
         INNER JOIN accounts a ON a.id = tam.account_id
         INNER JOIN customers c ON c.id = a.customer_id
         ${whereClause}
         ORDER BY tam.category, tam.rank_position`,
        params
    );

    return rows.map(row => ({
        rank: row.rank_position,
        accountId: row.account_id,
        accountNumber: row.account_number,
        customerName: row.customer_name,
        category: row.category,
        metricValue: parseFloat(row.metric_value),
    }));
}

// =============================================================================
// Aggregate Generation & Rebuild
// =============================================================================

/**
 * Generate monthly aggregates for a specific month
 * Calls sp_generate_monthly_aggregates stored procedure
 */
export async function generateMonthlyAggregates(
    year: number,
    month: number,
    userId: number
): Promise<AggregateGenerationResult> {
    // Call the stored procedure
    await execute(
        `CALL sp_generate_monthly_aggregates(?, ?, ?, @accounts_processed, @status, @message)`,
        [year, month, userId]
    );

    // Get output parameters
    const result = await queryOne<{
        accounts_processed: number;
        status: string;
        message: string;
    } & RowDataPacket>(
        `SELECT @accounts_processed as accounts_processed, @status as status, @message as message`
    );

    return {
        accountsProcessed: result?.accounts_processed || 0,
        status: result?.status || 'UNKNOWN',
        message: result?.message || '',
    };
}

/**
 * Rebuild all analytics tables from ledger
 * Admin-only operation - can be long-running
 */
export async function rebuildAnalytics(userId: number): Promise<RebuildResult> {
    // Call the stored procedure
    await execute(
        `CALL sp_rebuild_analytics(?, @daily_rows, @monthly_rows, @status, @message)`,
        [userId]
    );

    // Get output parameters
    const result = await queryOne<{
        daily_rows: number;
        monthly_rows: number;
        status: string;
        message: string;
    } & RowDataPacket>(
        `SELECT @daily_rows as daily_rows, @monthly_rows as monthly_rows, @status as status, @message as message`
    );

    return {
        dailyRows: result?.daily_rows || 0,
        monthlyRows: result?.monthly_rows || 0,
        status: result?.status || 'UNKNOWN',
        message: result?.message || '',
    };
}

// =============================================================================
// Available Periods
// =============================================================================

/**
 * Get list of months with available analytics data
 */
export async function getAvailablePeriods(): Promise<{ year: number; month: number }[]> {
    const rows = await query<({ year: number; month: number } & RowDataPacket)[]>(
        `SELECT DISTINCT YEAR(entry_date) as year, MONTH(entry_date) as month 
         FROM ledger_entries 
         ORDER BY year DESC, month DESC 
         LIMIT 24`
    );

    return rows.map(row => ({
        year: row.year,
        month: row.month,
    }));
}

/**
 * Get list of dates with available daily analytics data
 */
export async function getAvailableDates(limit: number = 30): Promise<string[]> {
    const rows = await query<({ date: Date } & RowDataPacket)[]>(
        `SELECT DISTINCT entry_date as date 
         FROM ledger_entries 
         ORDER BY entry_date DESC 
         LIMIT ?`,
        [limit]
    );

    return rows.map(row => row.date.toISOString().split('T')[0]);
}

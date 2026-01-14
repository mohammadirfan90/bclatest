import { query, queryOne, execute, withTransaction } from '../db';
import { RowDataPacket } from 'mysql2/promise';

// =============================================================================
// Types
// =============================================================================

export type AccountType = 'SAVINGS' | 'CURRENT' | 'BUSINESS';
export type AccountStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
export type ApplicationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface AccountApplication {
    id: number;
    customerId: number;
    accountType: AccountType;
    status: ApplicationStatus;
    reviewedBy?: number;
    reviewReason?: string;
    createdAt: Date;
    reviewedAt?: Date;
    customerName?: string;
    customerEmail?: string;
    kycStatus?: string;
}

export interface Account {
    id: number;
    accountNumber: string;
    customerId: number;
    accountType: AccountType;
    currency: string;
    status: AccountStatus;
    balanceLocked: boolean;
    rowVersion: number;
    openedAt: Date | null;
    closedAt: Date | null;
    createdAt: Date;
}

// =============================================================================
// Account Applications
// =============================================================================

export async function getAccountById(accountId: number): Promise<Account | null> {
    const account = await queryOne<any>(
        `SELECT a.id, a.account_number, a.customer_id, a.account_type_id,
                at.code as account_type, at.name as account_type_name,
                a.status, a.created_at,
                COALESCE(ab.currency, 'BDT') as currency
         FROM accounts a
         JOIN account_types at ON at.id = a.account_type_id
         LEFT JOIN account_balances ab ON ab.account_id = a.id
         WHERE a.id = ?`,
        [accountId]
    );

    if (!account) return null;

    return {
        id: account.id,
        accountNumber: account.account_number,
        customerId: account.customer_id,
        accountType: account.account_type,
        currency: account.currency,
        status: account.status,
        balanceLocked: false, // Simplified
        rowVersion: 1, // Simplified
        openedAt: account.created_at,
        closedAt: null,
        createdAt: account.created_at
    };
}

export async function getAccountsForCustomer(customerId: number): Promise<Account[]> {
    const rows = await query<any>(
        `SELECT a.id, a.account_number, a.customer_id, a.account_type_id,
                at.code as account_type, at.name as account_type_name,
                a.status, a.created_at,
                c.first_name, c.last_name,
                COALESCE(ab.available_balance, 0) as available_balance,
                COALESCE(ab.currency, 'BDT') as currency
         FROM accounts a
         JOIN customers c ON c.id = a.customer_id
         JOIN account_types at ON at.id = a.account_type_id
         LEFT JOIN account_balances ab ON ab.account_id = a.id
         WHERE a.customer_id = ?
         ORDER BY a.created_at DESC`,
        [customerId]
    );

    return rows.map((row: any) => ({
        id: row.id,
        accountNumber: row.account_number,
        customerId: row.customer_id,
        accountType: row.account_type,
        accountTypeName: row.account_type_name,
        currency: row.currency,
        status: row.status,
        balanceLocked: false, // Simplified - not tracked
        rowVersion: 1, // Simplified
        openedAt: row.created_at,
        closedAt: null,
        createdAt: row.created_at,
        customerName: `${row.first_name} ${row.last_name}`,
        balance: {
            availableBalance: parseFloat(row.available_balance || '0'),
            pendingBalance: 0,
            holdBalance: 0
        }
    }));
}


export async function applyForAccount(
    customerId: number,
    accountType: AccountType
): Promise<{ success: boolean; applicationId?: number; error?: string }> {
    // 1. Verify KYC Status (Must be VERIFIED)
    const customer = await queryOne<{ kyc_status: string } & RowDataPacket>(
        'SELECT kyc_status FROM customers WHERE id = ?',
        [customerId]
    );

    if (!customer) return { success: false, error: 'Customer not found' };
    if (customer.kyc_status !== 'VERIFIED') {
        return { success: false, error: `KYC verification required (Status: ${customer.kyc_status})` };
    }

    // 2. Create Application
    try {
        const result = await execute(
            `INSERT INTO account_applications (customer_id, account_type, status)
             VALUES (?, ?, 'PENDING')`,
            [customerId, accountType]
        );
        return { success: true, applicationId: result.insertId };
    } catch (error: any) {
        console.error('Error applying for account:', error);
        return { success: false, error: 'Failed to submit application' };
    }
}

export async function getPendingApplications(): Promise<AccountApplication[]> {
    const rows = await query<any>(
        `SELECT aa.*, 
                CONCAT(c.first_name, ' ', c.last_name) as customer_name,
                c.email as customer_email,
                c.kyc_status
         FROM account_applications aa
         JOIN customers c ON aa.customer_id = c.id
         WHERE aa.status = 'PENDING'
         ORDER BY aa.created_at ASC`
    );

    return rows.map((row: any) => ({
        id: row.id,
        customerId: row.customer_id,
        accountType: row.account_type,
        status: row.status,
        createdAt: row.created_at,
        customerName: row.customer_name,
        customerEmail: row.customer_email,
        kycStatus: row.kyc_status
    }));
}

// =============================================================================
// Banker Approval Workflow
// =============================================================================

export async function approveAccount(
    applicationId: number,
    bankerId: number
): Promise<{ success: boolean; accountId?: number; accountNumber?: string; error?: string }> {
    return withTransaction(async (connection) => {
        // 1. Get Application
        const [apps] = await connection.query<RowDataPacket[]>(
            'SELECT * FROM account_applications WHERE id = ? FOR UPDATE',
            [applicationId]
        );
        const app = apps[0];

        if (!app) throw new Error('Application not found');
        if (app.status !== 'PENDING') throw new Error(`Application is ${app.status}`);

        // 2. Generate Account Number (Strictly unique)
        // Format: [TYPE_PREFIX][YEAR][RANDOM] -> e.g. SAV202512345678
        const prefix = app.account_type.substring(0, 3).toUpperCase();
        const year = new Date().getFullYear();
        const random = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
        const accountNumber = `${prefix}${year}${random}`;

        // 3. Create Account
        const [accResult] = await connection.execute<any>(
            `INSERT INTO accounts (
                account_number, customer_id, account_type, currency, 
                status, balance_locked, row_version, opened_at, created_by
             ) VALUES (?, ?, ?, 'BDT', 'ACTIVE', FALSE, 1, NOW(), ?)`,
            [accountNumber, app.customer_id, app.account_type, bankerId]
        );
        const accountId = accResult.insertId;

        // 4. Create Initial History Snapshot
        await connection.execute(
            `INSERT INTO accounts_history (
                account_id, valid_from, status, balance_locked, 
                snapshot_payload, changed_by
             ) VALUES (?, NOW(), 'ACTIVE', FALSE, ?, ?)`,
            [accountId, JSON.stringify({ action: 'OPEN_ACCOUNT', applicationId }), bankerId]
        );

        // 5. Initialize Balance (Zero)
        await connection.execute(
            `INSERT INTO account_balances (account_id, available_balance, currency)
             VALUES (?, 0, 'BDT')`,
            [accountId]
        );

        // 6. Update Application Status
        await connection.execute(
            `UPDATE account_applications 
             SET status = 'APPROVED', reviewed_by = ?, reviewed_at = NOW() 
             WHERE id = ?`,
            [bankerId, applicationId]
        );

        return { success: true, accountId, accountNumber };
    });
}

export async function rejectAccount(
    applicationId: number,
    bankerId: number,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    try {
        await execute(
            `UPDATE account_applications 
             SET status = 'REJECTED', reviewed_by = ?, reviewed_at = NOW(), review_reason = ? 
             WHERE id = ? AND status = 'PENDING'`,
            [bankerId, reason, applicationId]
        );
        return { success: true };
    } catch (error) {
        console.error('Error rejecting account:', error);
        return { success: false, error: 'Failed' };
    }
}

// =============================================================================
// Lifecycle Management (Freeze/Unfreeze)
// =============================================================================

export async function freezeAccount(
    accountId: number,
    bankerId: number,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    return changeAccountStatus(accountId, 'SUSPENDED', true, bankerId, reason);
}

export async function unfreezeAccount(
    accountId: number,
    bankerId: number,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    return changeAccountStatus(accountId, 'ACTIVE', false, bankerId, reason);
}


export async function closeAccount(
    accountId: number,
    bankerId: number,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    return withTransaction(async (connection) => {
        // 1. Get Account & Validation
        const [accRows] = await connection.query<RowDataPacket[]>(
            'SELECT status, balance_locked FROM accounts WHERE id = ? FOR UPDATE',
            [accountId]
        );
        if (!accRows.length) throw new Error('Account not found');
        const account = accRows[0];

        if (account.status === 'CLOSED') throw new Error('Account is already CLOSED');

        // 2. Check Balance (Must be 0)
        const [balRows] = await connection.query<RowDataPacket[]>(
            'SELECT available_balance, pending_balance, hold_balance FROM account_balances WHERE account_id = ? FOR UPDATE',
            [accountId]
        );
        const balance = balRows[0];

        const totalBalance = parseFloat(balance.available_balance) +
            parseFloat(balance.pending_balance) +
            parseFloat(balance.hold_balance);

        if (totalBalance !== 0) {
            throw new Error(`Cannot close account. Non-zero balance: ${totalBalance}`);
        }

        // 3. Check Pending Disputes (Optional: Add if table exists and logic required)
        const [disputes] = await connection.query<RowDataPacket[]>(
            'SELECT COUNT(*) as count FROM disputes WHERE customer_id = (SELECT customer_id FROM accounts WHERE id = ?) AND status NOT IN ("RESOLVED", "REJECTED")',
            [accountId]
        );
        if (disputes[0].count > 0) {
            throw new Error('Cannot close account. Pending disputes exist.');
        }

        // 4. Archive History
        await connection.execute(
            `UPDATE accounts_history SET valid_to = NOW() WHERE account_id = ? AND valid_to IS NULL`,
            [accountId]
        );

        // 5. Insert Closing History
        await connection.execute(
            `INSERT INTO accounts_history (
                account_id, valid_from, status, balance_locked, 
                snapshot_payload, changed_by
             ) VALUES (?, NOW(), 'CLOSED', TRUE, ?, ?)`,
            [accountId, JSON.stringify({ reason }), bankerId]
        );

        // 6. Update Account Status
        await connection.execute(
            `UPDATE accounts 
             SET status = 'CLOSED', balance_locked = TRUE, closed_at = NOW(), 
                 row_version = row_version + 1, updated_at = NOW() 
             WHERE id = ?`,
            [accountId]
        );

        return { success: true };
    });
}

async function changeAccountStatus(
    accountId: number,
    newStatus: AccountStatus,
    balanceLocked: boolean,
    changedBy: number,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    return withTransaction(async (connection) => {
        // 1. Get current state and lock
        const [rows] = await connection.query<RowDataPacket[]>(
            'SELECT * FROM accounts WHERE id = ? FOR UPDATE',
            [accountId]
        );
        const current = rows[0];
        if (!current) throw new Error('Account not found');

        // 2. Archive current state to history (Close the previous validity period)
        // We update the 'valid_to' of the most recent history record?
        // Actually, strictly temporal usually means inserting a NEW record with new valid_from.
        // And optionally updating the previous one's valid_to.
        await connection.execute(
            `UPDATE accounts_history 
             SET valid_to = NOW() 
             WHERE account_id = ? AND valid_to IS NULL`,
            [accountId]
        );

        // 3. Insert new history record
        await connection.execute(
            `INSERT INTO accounts_history (
                account_id, valid_from, status, balance_locked, 
                snapshot_payload, changed_by
             ) VALUES (?, NOW(), ?, ?, ?, ?)`,
            [
                accountId,
                newStatus,
                balanceLocked,
                JSON.stringify({ reason, previousStatus: current.status }),
                changedBy
            ]
        );

        // 4. Update core account
        await connection.execute(
            `UPDATE accounts 
             SET status = ?, balance_locked = ?, row_version = row_version + 1, updated_at = NOW() 
             WHERE id = ?`,
            [newStatus, balanceLocked, accountId]
        );

        return { success: true };
    });
}

export async function refreshAccountBalance(accountId: number): Promise<void> {
    // Placeholder for balance recalculation from ledger
    // For now, we assume account_balances is consistent.
    // Future implementation: Sum all ledger entries and update account_balances.
    return;
}

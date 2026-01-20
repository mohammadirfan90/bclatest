import { query, queryOne, execute, withTransaction } from '../db';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

// =============================================================================
// Types
// =============================================================================

export type AccountType = 'SAVINGS' | 'CHECKING' | 'FIXED';
export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'CLOSED' | 'PENDING';

export interface Account {
    id: number;
    accountNumber: string;
    customerId: number;
    accountType: AccountType;
    currency: string;
    status: AccountStatus;
    openedAt: Date | null;
    createdAt: Date;
    customerName?: string;
    balance?: {
        availableBalance: number;
    };
}

// =============================================================================
// Account Queries
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
        openedAt: account.created_at,
        createdAt: account.created_at
    };
}

export async function getAccountByNumber(accountNumber: string): Promise<Account | null> {
    const account = await queryOne<any>(
        `SELECT a.id, a.account_number, a.customer_id, a.account_type_id,
                at.code as account_type, at.name as account_type_name,
                a.status, a.created_at,
                COALESCE(ab.currency, 'BDT') as currency
         FROM accounts a
         JOIN account_types at ON at.id = a.account_type_id
         LEFT JOIN account_balances ab ON ab.account_id = a.id
         WHERE a.account_number = ?`,
        [accountNumber]
    );

    if (!account) return null;

    return {
        id: account.id,
        accountNumber: account.account_number,
        customerId: account.customer_id,
        accountType: account.account_type,
        currency: account.currency,
        status: account.status,
        openedAt: account.created_at,
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
        openedAt: row.created_at,
        createdAt: row.created_at,
        customerName: `${row.first_name} ${row.last_name}`,
        balance: {
            availableBalance: parseFloat(row.available_balance || '0')
        }
    }));
}

// =============================================================================
// Lifecycle Management (Freeze/Unfreeze)
// =============================================================================

export async function freezeAccount(
    accountId: number,
    bankerId: number,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    try {
        await query(
            'UPDATE accounts SET status = "SUSPENDED", updated_at = NOW() WHERE id = ?',
            [accountId]
        );
        return { success: true };
    } catch (error) {
        console.error('Error freezing account:', error);
        return { success: false, error: 'Failed' };
    }
}

export async function unfreezeAccount(
    accountId: number,
    bankerId: number,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    try {
        await query(
            'UPDATE accounts SET status = "ACTIVE", updated_at = NOW() WHERE id = ?',
            [accountId]
        );
        return { success: true };
    } catch (error) {
        console.error('Error unfreezing account:', error);
        return { success: false, error: 'Failed' };
    }
}

export async function closeAccount(
    accountId: number,
    bankerId: number,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    try {
        // 1. Check Balance (Must be 0)
        const balanceRow = await queryOne<RowDataPacket>(
            'SELECT available_balance FROM account_balances WHERE account_id = ?',
            [accountId]
        );

        const balance = parseFloat(balanceRow?.available_balance || '0');
        if (balance !== 0) {
            return { success: false, error: `Cannot close account. Non-zero balance: ${balance}` };
        }

        // 2. Update Account Status
        await query(
            'UPDATE accounts SET status = "CLOSED", updated_at = NOW() WHERE id = ?',
            [accountId]
        );

        return { success: true };
    } catch (error) {
        console.error('Error closing account:', error);
        return { success: false, error: 'Failed' };
    }
}

// =============================================================================
// Account Creation (Direct)
// =============================================================================

export async function createAccount(
    customerId: number,
    accountTypeId: number,
    createdBy?: number
): Promise<{ success: boolean; accountId?: number; accountNumber?: string; error?: string }> {
    try {
        // 1. Verify Customer exists
        const customer = await queryOne<RowDataPacket>(
            'SELECT id FROM customers WHERE id = ?',
            [customerId]
        );

        if (!customer) {
            return { success: false, error: 'Customer not found' };
        }

        // 2. Generate Account Number (10 + 8 random digits)
        const accountNumber = '10' + Math.floor(10000000 + Math.random() * 90000000).toString();

        return await withTransaction(async (conn) => {
            // 3. Insert Account record
            const [accountResult] = await conn.execute<ResultSetHeader>(
                `INSERT INTO accounts (account_number, customer_id, account_type_id, status, opened_at, created_at, created_by)
                 VALUES (?, ?, ?, 'ACTIVE', NOW(), NOW(), ?)`,
                [accountNumber, customerId, accountTypeId, createdBy || null]
            );

            const accountId = accountResult.insertId;

            // 4. Initialize Balance record
            await conn.execute(
                `INSERT INTO account_balances (account_id, available_balance, currency, version)
                 VALUES (?, 0.0000, 'BDT', 1)`,
                [accountId]
            );

            return {
                success: true,
                accountId,
                accountNumber
            };
        });
    } catch (error) {
        console.error('Error creating account:', error);
        return { success: false, error: 'Database error during account creation' };
    }
}

/**
 * Legacy wrapper for application flow.
 * Now directly creates the account.
 */
export async function applyForAccount(
    customerId: number,
    accountTypeCode: AccountType
): Promise<{ success: boolean; applicationId?: number; error?: string }> {
    // Lookup Account Type ID
    const typeRow = await queryOne<RowDataPacket>(
        'SELECT id FROM account_types WHERE code = ?',
        [accountTypeCode]
    );

    if (!typeRow) {
        return { success: false, error: 'Invalid account type' };
    }

    const result = await createAccount(customerId, typeRow.id);

    if (result.success) {
        return { success: true, applicationId: result.accountId };
    }

    return { success: false, error: result.error };
}

export async function getPendingApplications(): Promise<any[]> {
    // No longer applicable, returning empty array
    return [];
}

/**
 * Onboards a new customer and creates their first account.
 * Designed to replace legacy onboarding flows.
 */
export async function onboardNewCustomer(
    data: {
        firstName: string;
        lastName: string;
        email: string;
        dateOfBirth: string;
        customerNumber: string;
        createdBy: number;
    }
): Promise<{ success: boolean; customerId?: number; accountId?: number; error?: string }> {
    try {
        // 1. Generate a temporary password (they should change it later)
        // Since we don't have an email system yet, we'll use a predictable but "safe-ish" default or random string.
        const tempPassword = 'Welcome!' + Math.floor(1000 + Math.random() * 9000);
        const { hashPassword } = await import('./auth-service');
        const passwordHash = await hashPassword(tempPassword);

        // 2. Lookup SAVINGS account type ID
        const typeRow = await queryOne<RowDataPacket>(
            "SELECT id FROM account_types WHERE code = 'SAVINGS'"
        );

        if (!typeRow) {
            return { success: false, error: 'Default account type (SAVINGS) not found' };
        }

        return await withTransaction(async (conn) => {
            // 3. Create Customer
            const [customerResult] = await conn.execute<ResultSetHeader>(
                `INSERT INTO customers 
                 (customer_number, email, first_name, last_name, date_of_birth, status, kyc_status, created_at, created_by, password_hash)
                 VALUES (?, ?, ?, ?, ?, 'ACTIVE', 'VERIFIED', NOW(), ?, ?)`,
                [data.customerNumber, data.email, data.firstName, data.lastName, data.dateOfBirth, data.createdBy, passwordHash]
            );

            const customerId = customerResult.insertId;

            // 4. Create Account
            const accountNumber = '10' + Math.floor(10000000 + Math.random() * 90000000).toString();
            const [accountResult] = await conn.execute<ResultSetHeader>(
                `INSERT INTO accounts (account_number, customer_id, account_type_id, status, opened_at, created_at, created_by)
                 VALUES (?, ?, ?, 'ACTIVE', NOW(), NOW(), ?)`,
                [accountNumber, customerId, typeRow.id, data.createdBy]
            );

            const accountId = accountResult.insertId;

            // 5. Initialize Balance
            await conn.execute(
                `INSERT INTO account_balances (account_id, available_balance, currency, version)
                 VALUES (?, 0.0000, 'BDT', 1)`,
                [accountId]
            );

            return {
                success: true,
                customerId,
                accountId,
                // We'll trust the caller to handle the temp password display if needed
                // but for now we just return success
            };
        });
    } catch (error) {
        if ((error as any).code === 'ER_DUP_ENTRY') {
            return { success: false, error: 'Email or Customer Number already exists' };
        }
        console.error('Error during onboarding:', error);
        return { success: false, error: 'Database error during customer onboarding' };
    }
}

export async function refreshAccountBalance(accountId: number): Promise<void> {
    // Placeholder - in real system would trigger reconciliation
    return;
}

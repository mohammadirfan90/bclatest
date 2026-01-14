/**
 * Verification Script for Teller Operations (Deposits & Withdrawals)
 * Tests double-entry ledger integrity and proper cash account behavior
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import mysql, { RowDataPacket } from 'mysql2/promise';

// =====================================================
// Configuration
// =====================================================
const getSSLConfig = () => {
    if (process.env.DATABASE_SSL !== 'true') return undefined;
    const certPath = path.join(process.cwd(), 'cert', 'DigiCertGlobalRootCA.crt');
    try {
        if (fs.existsSync(certPath)) {
            return { ca: fs.readFileSync(certPath), rejectUnauthorized: false };
        }
    } catch { /* ignore */ }
    return { rejectUnauthorized: false };
};

const dbConfig = {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '3306'),
    user: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PASSWORD || '',
    database: process.env.DATABASE_NAME || 'bnkcore',
    ssl: getSSLConfig(),
};

interface TestResult {
    name: string;
    passed: boolean;
    message: string;
}

const results: TestResult[] = [];

function log(msg: string) {
    console.log(`[${new Date().toISOString()}] ${msg}`);
}

// =====================================================
// Helper Functions
// =====================================================
async function getCashAccountId(conn: mysql.Connection): Promise<number | null> {
    const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM accounts WHERE account_number = 'BANK-CASH-001'`
    );
    return rows[0]?.id || null;
}

async function getBalance(conn: mysql.Connection, accountId: number): Promise<number> {
    const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT available_balance FROM account_balances WHERE account_id = ?`,
        [accountId]
    );
    return parseFloat(rows[0]?.available_balance || '0');
}

async function findActiveCustomerAccount(conn: mysql.Connection): Promise<{ id: number; balance: number } | null> {
    const [rows] = await conn.query<RowDataPacket[]>(`
        SELECT a.id, ab.available_balance
        FROM accounts a
        JOIN account_balances ab ON a.id = ab.account_id
        JOIN customers c ON a.customer_id = c.id
        WHERE a.status = 'ACTIVE' AND a.account_type != 'INTERNAL' AND c.customer_number != 'SYSTEM-BANK'
        ORDER BY ab.available_balance DESC
        LIMIT 1
    `);
    if (rows.length === 0) return null;
    return { id: rows[0].id, balance: parseFloat(rows[0].available_balance) };
}

async function callDeposit(
    conn: mysql.Connection,
    accountId: number,
    amount: number,
    description: string,
    userId: number
): Promise<{ transactionId: number | null; status: string; message: string }> {
    await conn.query(
        `CALL sp_teller_deposit(?, ?, ?, ?, NULL, @tx_id, @status, @msg)`,
        [accountId, amount, description, userId]
    );

    const [outRows] = await conn.query<RowDataPacket[]>(
        `SELECT @tx_id as tx_id, @status as status, @msg as msg`
    );

    return {
        transactionId: outRows[0].tx_id || null,
        status: outRows[0].status || 'UNKNOWN',
        message: outRows[0].msg || '',
    };
}

async function callWithdraw(
    conn: mysql.Connection,
    accountId: number,
    amount: number,
    description: string,
    userId: number
): Promise<{ transactionId: number | null; status: string; message: string }> {
    await conn.query(
        `CALL sp_teller_withdraw(?, ?, ?, ?, NULL, @tx_id, @status, @msg)`,
        [accountId, amount, description, userId]
    );

    const [outRows] = await conn.query<RowDataPacket[]>(
        `SELECT @tx_id as tx_id, @status as status, @msg as msg`
    );

    return {
        transactionId: outRows[0].tx_id || null,
        status: outRows[0].status || 'UNKNOWN',
        message: outRows[0].msg || '',
    };
}

async function countLedgerEntries(conn: mysql.Connection, transactionId: number): Promise<number> {
    const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT COUNT(*) as count FROM ledger_entries WHERE transaction_id = ?`,
        [transactionId]
    );
    return rows[0].count;
}

// =====================================================
// TESTS
// =====================================================

async function testDepositDoubleEntry(conn: mysql.Connection, customerId: number, cashId: number) {
    log('TEST 1: Deposit creates two ledger entries (double-entry)');

    const initialCustomerBal = await getBalance(conn, customerId);
    const initialCashBal = await getBalance(conn, cashId);
    const depositAmount = 1000;

    const result = await callDeposit(conn, customerId, depositAmount, 'Test deposit', 1);

    if (result.status !== 'COMPLETED') {
        results.push({ name: 'Deposit Double-Entry', passed: false, message: `Deposit failed: ${result.message}` });
        return;
    }

    const entries = await countLedgerEntries(conn, result.transactionId!);
    const finalCustomerBal = await getBalance(conn, customerId);
    const finalCashBal = await getBalance(conn, cashId);

    const customerIncrease = finalCustomerBal - initialCustomerBal;
    const cashDecrease = initialCashBal - finalCashBal;

    const passed = entries === 2 &&
        Math.abs(customerIncrease - depositAmount) < 0.01 &&
        Math.abs(cashDecrease - depositAmount) < 0.01;

    results.push({
        name: 'Deposit Double-Entry',
        passed,
        message: passed
            ? `2 entries created, customer +${customerIncrease}, cash -${cashDecrease}`
            : `Failed: entries=${entries}, customer change=${customerIncrease}, cash change=${cashDecrease}`
    });
}

async function testWithdrawDoubleEntry(conn: mysql.Connection, customerId: number, cashId: number) {
    log('TEST 2: Withdrawal creates two ledger entries (double-entry)');

    const initialCustomerBal = await getBalance(conn, customerId);
    const initialCashBal = await getBalance(conn, cashId);
    const withdrawAmount = 500;

    if (initialCustomerBal < withdrawAmount) {
        results.push({ name: 'Withdraw Double-Entry', passed: false, message: 'Customer balance too low' });
        return;
    }

    const result = await callWithdraw(conn, customerId, withdrawAmount, 'Test withdrawal', 1);

    if (result.status !== 'COMPLETED') {
        results.push({ name: 'Withdraw Double-Entry', passed: false, message: `Withdrawal failed: ${result.message}` });
        return;
    }

    const entries = await countLedgerEntries(conn, result.transactionId!);
    const finalCustomerBal = await getBalance(conn, customerId);
    const finalCashBal = await getBalance(conn, cashId);

    const customerDecrease = initialCustomerBal - finalCustomerBal;
    const cashIncrease = finalCashBal - initialCashBal;

    const passed = entries === 2 &&
        Math.abs(customerDecrease - withdrawAmount) < 0.01 &&
        Math.abs(cashIncrease - withdrawAmount) < 0.01;

    results.push({
        name: 'Withdraw Double-Entry',
        passed,
        message: passed
            ? `2 entries created, customer -${customerDecrease}, cash +${cashIncrease}`
            : `Failed: entries=${entries}, customer change=-${customerDecrease}, cash change=+${cashIncrease}`
    });
}

async function testInsufficientBalance(conn: mysql.Connection, customerId: number) {
    log('TEST 3: Withdrawal rejects insufficient balance');

    const balance = await getBalance(conn, customerId);
    const overAmount = balance + 10000;

    const result = await callWithdraw(conn, customerId, overAmount, 'Over-withdraw', 1);

    const passed = result.status === 'FAILED' && result.message.toLowerCase().includes('insufficient');

    results.push({
        name: 'Insufficient Balance',
        passed,
        message: passed ? 'Correctly rejected' : `Unexpected: ${result.status} - ${result.message}`
    });
}

async function testLedgerIntegrity(conn: mysql.Connection) {
    log('TEST 4: Ledger integrity (sum of debits = sum of credits per transaction)');

    const [rows] = await conn.query<RowDataPacket[]>(`
        SELECT transaction_id,
               SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END) as total_debits,
               SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END) as total_credits
        FROM ledger_entries
        GROUP BY transaction_id
        HAVING ABS(total_debits - total_credits) > 0.01
    `);

    const passed = rows.length === 0;

    results.push({
        name: 'Ledger Integrity',
        passed,
        message: passed ? 'All transactions balanced' : `${rows.length} unbalanced transactions found`
    });
}

async function testZeroAmountRejection(conn: mysql.Connection, customerId: number) {
    log('TEST 5: Zero/negative amount rejection');

    const resultZero = await callDeposit(conn, customerId, 0, 'Zero deposit', 1);
    const resultNeg = await callWithdraw(conn, customerId, -100, 'Negative withdraw', 1);

    const passed = resultZero.status === 'FAILED' && resultNeg.status === 'FAILED';

    results.push({
        name: 'Zero/Negative Amount',
        passed,
        message: passed ? 'Correctly rejected' : `Zero: ${resultZero.status}, Neg: ${resultNeg.status}`
    });
}

// =====================================================
// Main
// =====================================================
async function main() {
    log('=== Starting Teller Operations Verification ===');
    log('');

    const conn = await mysql.createConnection(dbConfig);

    try {
        // Get test accounts
        const cashAccountId = await getCashAccountId(conn);
        if (!cashAccountId) {
            log('❌ BANK-CASH-001 account not found. Run migrate-006.ts first.');
            return;
        }
        log(`Bank Cash Account ID: ${cashAccountId}`);

        const customerAccount = await findActiveCustomerAccount(conn);
        if (!customerAccount) {
            log('❌ No active customer account found.');
            return;
        }
        log(`Customer Account ID: ${customerAccount.id}, Balance: ${customerAccount.balance}`);
        log('');

        // Run tests
        await testDepositDoubleEntry(conn, customerAccount.id, cashAccountId);
        await testWithdrawDoubleEntry(conn, customerAccount.id, cashAccountId);
        await testInsufficientBalance(conn, customerAccount.id);
        await testLedgerIntegrity(conn);
        await testZeroAmountRejection(conn, customerAccount.id);

        // Write results to JSON file for agent to read
        fs.writeFileSync('verification_results.json', JSON.stringify(results, null, 2));
        log('Results written to verification_results.json');

        // Print results
        log('');
        log('=== VERIFICATION RESULTS ===');
        let allPassed = true;
        for (const r of results) {
            const icon = r.passed ? '✅' : '❌';
            console.log(`${icon} ${r.name}: ${r.message}`);
            if (!r.passed) allPassed = false;
        }
        log('');
        log(allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED');

    } catch (error) {
        console.error('Verification failed:', error);
    } finally {
        await conn.end();
    }
}

main();

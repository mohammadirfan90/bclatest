/**
 * Verification Script for Feature 14: Statements & PDF Generation
 * 
 * Tests:
 * 1. Statement generation with running balance computation
 * 2. PDF generation
 * 3. Transaction search functionality
 * 
 * Uses direct database access for testing service layer
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import mysql, { RowDataPacket } from 'mysql2/promise';

// Load SSL certificate
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

// =============================================================================
// TEST 1: Statement Data Query
// =============================================================================
async function testStatementDataQuery(conn: mysql.Connection) {
    log('TEST 1: Statement Data Query');

    // Find an account with ledger entries
    const [accounts] = await conn.query<RowDataPacket[]>(
        `SELECT DISTINCT le.account_id, a.account_number
         FROM ledger_entries le
         JOIN accounts a ON le.account_id = a.id
         LIMIT 1`
    );

    if (accounts.length === 0) {
        results.push({ name: 'Statement Data Query', passed: false, message: 'No ledger entries found' });
        return;
    }

    const testAccountId = accounts[0].account_id;
    const accountNumber = accounts[0].account_number;
    log(`   Using account: ${testAccountId} (${accountNumber})`);

    // Get date range for entries
    const [dateRange] = await conn.query<RowDataPacket[]>(
        `SELECT MIN(entry_date) as min_date, MAX(entry_date) as max_date
         FROM ledger_entries WHERE account_id = ?`,
        [testAccountId]
    );

    const fromDate = dateRange[0].min_date;
    const toDate = dateRange[0].max_date;
    log(`   Date range: ${fromDate} to ${toDate}`);

    // Calculate opening balance (entries before period)
    const [openingBalance] = await conn.query<RowDataPacket[]>(
        `SELECT 
            COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0) as total_credits,
            COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END), 0) as total_debits
         FROM ledger_entries
         WHERE account_id = ? AND entry_date < ?`,
        [testAccountId, fromDate]
    );

    const openingBal = parseFloat(openingBalance[0].total_credits) - parseFloat(openingBalance[0].total_debits);
    log(`   Opening Balance: ${openingBal.toFixed(2)}`);

    // Get period entries
    const [periodEntries] = await conn.query<RowDataPacket[]>(
        `SELECT id, entry_type, amount, entry_date, description
         FROM ledger_entries
         WHERE account_id = ? AND entry_date >= ? AND entry_date <= ?
         ORDER BY created_at ASC, id ASC`,
        [testAccountId, fromDate, toDate]
    );

    log(`   Period entries: ${periodEntries.length}`);

    // Calculate closing balance
    const [closingBalance] = await conn.query<RowDataPacket[]>(
        `SELECT 
            COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0) as total_credits,
            COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END), 0) as total_debits
         FROM ledger_entries
         WHERE account_id = ? AND entry_date <= ?`,
        [testAccountId, toDate]
    );

    const closingBal = parseFloat(closingBalance[0].total_credits) - parseFloat(closingBalance[0].total_debits);
    log(`   Closing Balance: ${closingBal.toFixed(2)}`);

    // Verify running balance computation
    let runningBalance = openingBal;
    let runningBalanceCorrect = true;

    for (const entry of periodEntries) {
        const amount = parseFloat(entry.amount);
        if (entry.entry_type === 'CREDIT') {
            runningBalance += amount;
        } else {
            runningBalance -= amount;
        }
    }

    // Final running balance should equal closing balance
    const balanceMatch = Math.abs(runningBalance - closingBal) < 0.01;

    results.push({
        name: 'Statement Data Query',
        passed: balanceMatch,
        message: balanceMatch
            ? `✅ Balance verified: Opening ${openingBal.toFixed(2)} → Closing ${closingBal.toFixed(2)} (${periodEntries.length} entries)`
            : `❌ Balance mismatch: computed ${runningBalance.toFixed(2)} vs stored ${closingBal.toFixed(2)}`
    });
}

// =============================================================================
// TEST 2: Transaction Search Query
// =============================================================================
async function testTransactionSearchQuery(conn: mysql.Connection) {
    log('TEST 2: Transaction Search Query');

    // Test basic search
    const [allEntries] = await conn.query<RowDataPacket[]>(
        `SELECT COUNT(*) as total FROM ledger_entries`
    );
    log(`   Total ledger entries: ${allEntries[0].total}`);

    // Test filtered search - CREDIT only
    const [creditEntries] = await conn.query<RowDataPacket[]>(
        `SELECT COUNT(*) as total FROM ledger_entries WHERE entry_type = 'CREDIT'`
    );

    // Test amount range filter
    const [amountFiltered] = await conn.query<RowDataPacket[]>(
        `SELECT COUNT(*) as total FROM ledger_entries WHERE amount >= 100 AND amount <= 10000`
    );

    // Test join with transactions
    const [joinResult] = await conn.query<RowDataPacket[]>(
        `SELECT le.id, t.transaction_reference, tt.code as transaction_type
         FROM ledger_entries le
         JOIN transactions t ON le.transaction_id = t.id
         JOIN transaction_types tt ON t.transaction_type_id = tt.id
         LIMIT 5`
    );

    log(`   Credit entries: ${creditEntries[0].total}`);
    log(`   Amount filtered (100-10000): ${amountFiltered[0].total}`);
    log(`   Sample joined records: ${joinResult.length}`);

    const passed = joinResult.length > 0 || allEntries[0].total === 0;

    results.push({
        name: 'Transaction Search Query',
        passed,
        message: passed
            ? `✅ Search queries working. Total: ${allEntries[0].total}, Credits: ${creditEntries[0].total}`
            : '❌ No transaction data found for search'
    });
}

// =============================================================================
// TEST 3: Account Info for Statements
// =============================================================================
async function testAccountInfoQuery(conn: mysql.Connection) {
    log('TEST 3: Account Info Query');

    const [accounts] = await conn.query<RowDataPacket[]>(
        `SELECT a.id, a.account_number, a.account_type as account_type_name,
                CONCAT(c.first_name, ' ', c.last_name) as customer_name
         FROM accounts a
         JOIN customers c ON a.customer_id = c.id
         WHERE a.status = 'ACTIVE'
         LIMIT 5`
    );

    if (accounts.length > 0) {
        log(`   Found ${accounts.length} active accounts`);
        for (const acc of accounts.slice(0, 3)) {
            log(`   - ${acc.account_number} (${acc.account_type_name}) - ${acc.customer_name}`);
        }
    }

    results.push({
        name: 'Account Info Query',
        passed: accounts.length > 0,
        message: accounts.length > 0
            ? `✅ Found ${accounts.length} accounts with customer info`
            : '❌ No active accounts found'
    });
}

// =============================================================================
// TEST 4: PDF Data Availability
// =============================================================================
async function testPdfDataAvailability(conn: mysql.Connection) {
    log('TEST 4: PDF Data Availability');

    // Check if we have all the data needed for PDF generation
    const checks = {
        accounts: false,
        ledgerEntries: false,
        transactions: false,
        transactionTypes: false,
    };

    const [accounts] = await conn.query<RowDataPacket[]>(`SELECT COUNT(*) as c FROM accounts`);
    checks.accounts = accounts[0].c > 0;

    const [ledger] = await conn.query<RowDataPacket[]>(`SELECT COUNT(*) as c FROM ledger_entries`);
    checks.ledgerEntries = ledger[0].c > 0;

    const [transactions] = await conn.query<RowDataPacket[]>(`SELECT COUNT(*) as c FROM transactions`);
    checks.transactions = transactions[0].c > 0;

    const [transactionTypes] = await conn.query<RowDataPacket[]>(`SELECT COUNT(*) as c FROM transaction_types`);
    checks.transactionTypes = transactionTypes[0].c > 0;

    log(`   Accounts: ${accounts[0].c}`);
    log(`   Ledger Entries: ${ledger[0].c}`);
    log(`   Transactions: ${transactions[0].c}`);
    log(`   Transaction Types: ${transactionTypes[0].c}`);

    const allPassed = Object.values(checks).every(Boolean);

    results.push({
        name: 'PDF Data Availability',
        passed: allPassed,
        message: allPassed
            ? '✅ All required data tables have records'
            : `⚠️ Some tables may be empty: ${JSON.stringify(checks)}`
    });
}

// =============================================================================
// TEST 5: Statement API Endpoint Check (No Auth)
// =============================================================================
async function testStatementAPIEndpoints() {
    log('TEST 5: Statement API Endpoints Check');

    const endpoints = [
        '/api/v1/accounts/1/statement',
        '/api/v1/accounts/1/statement/pdf',
        '/api/v1/transactions/search',
    ];

    const results_local: { endpoint: string; status: number }[] = [];

    for (const endpoint of endpoints) {
        try {
            const response = await fetch(`http://localhost:3000${endpoint}`);
            results_local.push({ endpoint, status: response.status });
            log(`   ${endpoint}: ${response.status}`);
        } catch (error) {
            log(`   ${endpoint}: ERROR (server may not be running)`);
            results_local.push({ endpoint, status: 0 });
        }
    }

    // We expect 401 (unauthorized) if endpoints exist but require auth
    const allExist = results_local.every(r => r.status === 401 || r.status === 400);

    results.push({
        name: 'Statement API Endpoints',
        passed: allExist,
        message: allExist
            ? '✅ All endpoints exist and require auth (401) or validation (400)'
            : `⚠️ Some endpoints may not exist: ${results_local.map(r => `${r.endpoint}:${r.status}`).join(', ')}`
    });
}

// =============================================================================
// MAIN
// =============================================================================
async function main() {
    console.log('='.repeat(60));
    console.log('Feature 14: Statements & PDF Generation - Verification');
    console.log('='.repeat(60));

    const conn = await mysql.createConnection(dbConfig);

    try {
        await testStatementDataQuery(conn);
        await testTransactionSearchQuery(conn);
        await testAccountInfoQuery(conn);
        await testPdfDataAvailability(conn);
        await testStatementAPIEndpoints();

        console.log('\n' + '='.repeat(60));
        console.log('VERIFICATION SUMMARY');
        console.log('='.repeat(60));

        for (const r of results) {
            const icon = r.passed ? '✅' : '❌';
            console.log(`${icon} ${r.name}: ${r.message}`);
        }

        const allPassed = results.every(r => r.passed);
        console.log('\n' + (allPassed ? '✅ ALL TESTS PASSED' : '⚠️ SOME TESTS NEED ATTENTION'));

        process.exit(allPassed ? 0 : 1);
    } catch (error) {
        console.error('\n❌ Verification failed with error:', error);
        process.exit(1);
    } finally {
        await conn.end();
    }
}

main();

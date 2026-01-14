/**
 * Verification Script for Transaction Reversals
 * Tests TRANSFER, DEPOSIT, and WITHDRAWAL reversals
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

async function getBalance(conn: mysql.Connection, accountId: number): Promise<number> {
    const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT available_balance FROM account_balances WHERE account_id = ?`,
        [accountId]
    );
    return parseFloat(rows[0]?.available_balance || '0');
}

async function findTestAccount(conn: mysql.Connection): Promise<number | null> {
    const [accounts] = await conn.query<RowDataPacket[]>(
        `SELECT a.id
         FROM accounts a
         JOIN account_balances ab ON a.id = ab.account_id
         WHERE a.status = 'ACTIVE'
         ORDER BY ab.available_balance DESC
         LIMIT 1`
    );
    return accounts.length > 0 ? accounts[0].id : null;
}

async function callReversal(
    conn: mysql.Connection,
    txId: number,
    reason: string,
    userId: number = 1
): Promise<{ reversalTxId: number | null; status: string; message: string }> {
    await conn.query(
        `CALL sp_reverse_transaction(?, ?, ?, @rev_tx_id, @status, @msg)`,
        [txId, reason, userId]
    );

    const [outRows] = await conn.query<RowDataPacket[]>(
        `SELECT @rev_tx_id as rev_tx_id, @status as status, @msg as msg`
    );

    return {
        reversalTxId: outRows[0].rev_tx_id || null,
        status: outRows[0].status || 'UNKNOWN',
        message: outRows[0].msg || '',
    };
}

// Helper to get numeric transaction ID from UUID reference
async function getNumericTxId(conn: mysql.Connection, uuidRef: string): Promise<number | null> {
    const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM transactions WHERE transaction_reference = ?`,
        [uuidRef]
    );
    return rows.length > 0 ? rows[0].id : null;
}

// =============================================================================
// TEST 1: Transfer Reversal
// =============================================================================
async function testTransferReversal(conn: mysql.Connection) {
    log('TEST 1: Transfer Reversal');

    // Find two active accounts
    const [accounts] = await conn.query<RowDataPacket[]>(
        `SELECT a.id, ab.available_balance
         FROM accounts a
         JOIN account_balances ab ON a.id = ab.account_id
         WHERE a.status = 'ACTIVE'
         ORDER BY ab.available_balance DESC
         LIMIT 2`
    );

    if (accounts.length < 2) {
        results.push({ name: 'Transfer Reversal', passed: false, message: 'Need at least 2 active accounts' });
        return;
    }

    const fromId = accounts[0].id;
    const toId = accounts[1].id;
    const initialFrom = await getBalance(conn, fromId);
    const initialTo = await getBalance(conn, toId);
    const amount = 100;

    log(`  Initial balances: From=${initialFrom}, To=${initialTo}`);

    // Create a transfer
    await conn.query(
        `CALL sp_transfer(?, ?, ?, ?, ?, NULL, @tx_id, @status, @msg)`,
        [fromId, toId, amount, 'Test transfer for reversal', `idem-rev-${Date.now()}`]
    );
    const [txResult] = await conn.query<RowDataPacket[]>(`SELECT @tx_id as tx_id, @status as status`);
    const txRef = txResult[0].tx_id; // This is UUID reference, not numeric ID

    if (!txRef) {
        results.push({ name: 'Transfer Reversal', passed: false, message: 'Failed to create initial transfer' });
        return;
    }

    // Get numeric transaction ID from the reference
    const txId = await getNumericTxId(conn, txRef);
    if (!txId) {
        results.push({ name: 'Transfer Reversal', passed: false, message: 'Could not find transaction by reference' });
        return;
    }

    log(`  Created transfer: ref=${txRef}, numericId=${txId}`);

    const afterTransferFrom = await getBalance(conn, fromId);
    const afterTransferTo = await getBalance(conn, toId);
    log(`  After transfer: From=${afterTransferFrom}, To=${afterTransferTo}`);

    // Reverse the transfer using numeric ID
    const reversal = await callReversal(conn, txId, 'Test reversal - duplicate transfer');
    log(`  Reversal: status=${reversal.status}, message=${reversal.message}, revTxId=${reversal.reversalTxId}`);

    const finalFrom = await getBalance(conn, fromId);
    const finalTo = await getBalance(conn, toId);
    log(`  Final balances: From=${finalFrom}, To=${finalTo}`);

    const balancesRestored =
        Math.abs(finalFrom - initialFrom) < 0.01 &&
        Math.abs(finalTo - initialTo) < 0.01;

    const passed = reversal.status === 'COMPLETED' && balancesRestored;

    results.push({
        name: 'Transfer Reversal',
        passed,
        message: passed
            ? `Transfer reversed. Balances restored correctly.`
            : `Failed: ${reversal.message}. From: ${initialFrom}→${finalFrom}, To: ${initialTo}→${finalTo}`
    });
}

// =============================================================================
// TEST 2: Deposit Reversal
// =============================================================================
async function testDepositReversal(conn: mysql.Connection) {
    log('TEST 2: Deposit Reversal');

    const accountId = await findTestAccount(conn);
    if (!accountId) {
        results.push({ name: 'Deposit Reversal', passed: false, message: 'No active account found' });
        return;
    }

    const initialBalance = await getBalance(conn, accountId);
    const depositAmount = 500;

    log(`  Account: ${accountId}, Initial balance: ${initialBalance}`);

    // Create a deposit
    await conn.query(
        `CALL sp_deposit(?, ?, ?, ?, ?, @tx_id, @status, @msg)`,
        [accountId, depositAmount, 'Test deposit for reversal', `DEP-${Date.now()}`, 1]
    );
    const [txResult] = await conn.query<RowDataPacket[]>(`SELECT @tx_id as tx_id, @status as status`);
    const txId = txResult[0].tx_id;

    if (!txId) {
        results.push({ name: 'Deposit Reversal', passed: false, message: 'Failed to create deposit' });
        return;
    }

    log(`  Created deposit: txId=${txId}`);

    const afterDeposit = await getBalance(conn, accountId);
    log(`  After deposit: ${afterDeposit}`);

    // Reverse the deposit
    const reversal = await callReversal(conn, txId, 'Test reversal - incorrect deposit amount');
    log(`  Reversal: status=${reversal.status}, message=${reversal.message}`);

    const finalBalance = await getBalance(conn, accountId);
    log(`  Final balance: ${finalBalance}`);

    const balanceRestored = Math.abs(finalBalance - initialBalance) < 0.01;
    const passed = reversal.status === 'COMPLETED' && balanceRestored;

    results.push({
        name: 'Deposit Reversal',
        passed,
        message: passed
            ? `Deposit reversed. Balance restored from ${afterDeposit} to ${finalBalance}`
            : `Failed: ${reversal.message}. Expected: ${initialBalance}, Got: ${finalBalance}`
    });
}

// =============================================================================
// TEST 3: Withdrawal Reversal
// =============================================================================
async function testWithdrawalReversal(conn: mysql.Connection) {
    log('TEST 3: Withdrawal Reversal');

    const accountId = await findTestAccount(conn);
    if (!accountId) {
        results.push({ name: 'Withdrawal Reversal', passed: false, message: 'No active account found' });
        return;
    }

    const initialBalance = await getBalance(conn, accountId);
    const withdrawAmount = Math.min(200, initialBalance);

    if (withdrawAmount <= 0) {
        results.push({ name: 'Withdrawal Reversal', passed: false, message: 'Account has no balance' });
        return;
    }

    log(`  Account: ${accountId}, Initial balance: ${initialBalance}, Withdraw: ${withdrawAmount}`);

    // Create a withdrawal
    await conn.query(
        `CALL sp_withdraw(?, ?, ?, ?, ?, @tx_id, @status, @msg)`,
        [accountId, withdrawAmount, 'Test withdrawal for reversal', `WD-${Date.now()}`, 1]
    );
    const [txResult] = await conn.query<RowDataPacket[]>(`SELECT @tx_id as tx_id, @status as status`);
    const txId = txResult[0].tx_id;

    if (!txId) {
        results.push({ name: 'Withdrawal Reversal', passed: false, message: 'Failed to create withdrawal' });
        return;
    }

    log(`  Created withdrawal: txId=${txId}`);

    const afterWithdraw = await getBalance(conn, accountId);
    log(`  After withdrawal: ${afterWithdraw}`);

    // Reverse the withdrawal
    const reversal = await callReversal(conn, txId, 'Test reversal - customer dispute');
    log(`  Reversal: status=${reversal.status}, message=${reversal.message}`);

    const finalBalance = await getBalance(conn, accountId);
    log(`  Final balance: ${finalBalance}`);

    const balanceRestored = Math.abs(finalBalance - initialBalance) < 0.01;
    const passed = reversal.status === 'COMPLETED' && balanceRestored;

    results.push({
        name: 'Withdrawal Reversal',
        passed,
        message: passed
            ? `Withdrawal reversed. Balance restored from ${afterWithdraw} to ${finalBalance}`
            : `Failed: ${reversal.message}. Expected: ${initialBalance}, Got: ${finalBalance}`
    });
}

// =============================================================================
// TEST 4: Already Reversed Rejection
// =============================================================================
async function testAlreadyReversed(conn: mysql.Connection) {
    log('TEST 4: Already Reversed Rejection');

    // Find an already-reversed transaction
    const [reversed] = await conn.query<RowDataPacket[]>(
        `SELECT id FROM transactions WHERE status = 'REVERSED' LIMIT 1`
    );

    if (reversed.length === 0) {
        log('  Skipping: No reversed transactions found');
        results.push({ name: 'Already Reversed', passed: true, message: 'Skipped - no reversed transactions to test' });
        return;
    }

    const txId = reversed[0].id;
    log(`  Testing reversal of already-reversed tx: ${txId}`);

    const reversal = await callReversal(conn, txId, 'Testing double reversal');
    log(`  Result: status=${reversal.status}, message=${reversal.message}`);

    const passed = reversal.status === 'FAILED' &&
        (reversal.message.toLowerCase().includes('already') || reversal.message.toLowerCase().includes('completed'));

    results.push({
        name: 'Already Reversed',
        passed,
        message: passed
            ? 'Correctly rejected double reversal'
            : `Expected rejection, got: ${reversal.status} - ${reversal.message}`
    });
}

// =============================================================================
// TEST 5: Double Entry Integrity Check
// =============================================================================
async function testDoubleEntryIntegrity(conn: mysql.Connection) {
    log('TEST 5: Double Entry Integrity');

    // Check that all reversal transactions have proper opposing ledger entries
    const [reversals] = await conn.query<RowDataPacket[]>(
        `SELECT t.id, t.reversal_of_id
         FROM transactions t
         JOIN transaction_types tt ON t.transaction_type_id = tt.id
         WHERE tt.code = 'REVERSAL'
         LIMIT 5`
    );

    if (reversals.length === 0) {
        log('  Skipping: No reversal transactions found');
        results.push({ name: 'Double Entry Integrity', passed: true, message: 'Skipped - no reversals to check' });
        return;
    }

    let allValid = true;
    for (const rev of reversals) {
        // Get original entries
        const [origEntries] = await conn.query<RowDataPacket[]>(
            `SELECT account_id, entry_type, amount FROM ledger_entries WHERE transaction_id = ?`,
            [rev.reversal_of_id]
        );

        // Get reversal entries
        const [revEntries] = await conn.query<RowDataPacket[]>(
            `SELECT account_id, entry_type, amount FROM ledger_entries WHERE transaction_id = ?`,
            [rev.id]
        );

        log(`  Reversal ${rev.id} of ${rev.reversal_of_id}: orig=${origEntries.length} entries, rev=${revEntries.length} entries`);

        // For each original entry, there should be a reversal entry with opposite type
        for (const orig of origEntries) {
            const matchingRev = revEntries.find(
                r => r.account_id === orig.account_id &&
                    r.amount === orig.amount &&
                    r.entry_type !== orig.entry_type  // Opposite type
            );
            if (!matchingRev) {
                log(`    Missing opposite entry for account ${orig.account_id}`);
                allValid = false;
            }
        }
    }

    results.push({
        name: 'Double Entry Integrity',
        passed: allValid,
        message: allValid
            ? `All ${reversals.length} reversal(s) have proper opposing ledger entries`
            : 'Some reversals are missing proper opposing ledger entries'
    });
}

// =============================================================================
// MAIN
// =============================================================================
async function main() {
    log('=== Starting Transaction Reversal Verification ===');

    const conn = await mysql.createConnection(dbConfig);

    try {
        await testTransferReversal(conn);
        await testDepositReversal(conn);
        await testWithdrawalReversal(conn);
        await testAlreadyReversed(conn);
        await testDoubleEntryIntegrity(conn);

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
        console.error('Verification failed with error:', error);
    } finally {
        await conn.end();
    }
}

main();

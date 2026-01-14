/**
 * Verification Script for Idempotency Protection
 * Tests deposit and withdrawal idempotency at the database level
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import mysql, { RowDataPacket } from 'mysql2/promise';

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

async function findTestAccount(conn: mysql.Connection): Promise<{ accountId: number } | null> {
    const [accounts] = await conn.query<RowDataPacket[]>(
        `SELECT a.id
         FROM accounts a
         JOIN account_balances ab ON a.id = ab.account_id
         WHERE a.status = 'ACTIVE' AND a.account_number != 'BANK-CASH-001'
         ORDER BY ab.available_balance DESC
         LIMIT 1`
    );

    if (accounts.length === 0) {
        log('ERROR: No active accounts found for testing');
        return null;
    }

    return { accountId: accounts[0].id };
}

async function callDeposit(
    conn: mysql.Connection,
    accountId: number,
    amount: number,
    description: string,
    idempotencyKey: string
): Promise<{ transactionId: string | null; status: string; message: string }> {
    await conn.query(
        `CALL sp_teller_deposit(?, ?, ?, 1, ?, @tx_id, @status, @msg)`,
        [accountId, amount, description, idempotencyKey]
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
    idempotencyKey: string
): Promise<{ transactionId: string | null; status: string; message: string }> {
    await conn.query(
        `CALL sp_teller_withdraw(?, ?, ?, 1, ?, @tx_id, @status, @msg)`,
        [accountId, amount, description, idempotencyKey]
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

// =============================================================================
// TEST 1: Deposit Idempotency
// =============================================================================
async function testDepositIdempotency(conn: mysql.Connection, accountId: number) {
    log('TEST 1: Deposit Idempotency');

    const idempotencyKey = `idem-dep-${Date.now()}`;
    const initialBalance = await getBalance(conn, accountId);
    const depositAmount = 500;

    log(`  Initial Balance: ${initialBalance}, Amount: ${depositAmount}`);
    log(`  Idempotency Key: ${idempotencyKey}`);

    // First call
    const result1 = await callDeposit(conn, accountId, depositAmount, 'Idempotency test deposit', idempotencyKey);
    const afterFirst = await getBalance(conn, accountId);
    log(`  First call: status=${result1.status}, txId=${result1.transactionId}, balance=${afterFirst}`);

    // Second call with same key
    const result2 = await callDeposit(conn, accountId, depositAmount, 'Idempotency test deposit', idempotencyKey);
    const afterSecond = await getBalance(conn, accountId);
    log(`  Second call: status=${result2.status}, txId=${result2.transactionId}, message=${result2.message}, balance=${afterSecond}`);

    // Verify
    const txMatch = result1.transactionId === result2.transactionId;
    const balanceUnchanged = Math.abs(afterFirst - afterSecond) < 0.01;
    const correctCredit = Math.abs((initialBalance + depositAmount) - afterFirst) < 0.01;
    const isReplay = result2.message === 'Idempotent replay';

    const passed = txMatch && balanceUnchanged && correctCredit && isReplay;

    results.push({
        name: 'Deposit Idempotency',
        passed,
        message: passed
            ? `Idempotency works. Same txId (${result1.transactionId}) returned. Balance only increased once.`
            : `Failed: txMatch=${txMatch}, balanceUnchanged=${balanceUnchanged}, correctCredit=${correctCredit}, isReplay=${isReplay}`
    });
}

// =============================================================================
// TEST 2: Withdrawal Idempotency
// =============================================================================
async function testWithdrawIdempotency(conn: mysql.Connection, accountId: number) {
    log('TEST 2: Withdrawal Idempotency');

    const idempotencyKey = `idem-wd-${Date.now()}`;
    const initialBalance = await getBalance(conn, accountId);
    const withdrawAmount = Math.min(200, initialBalance);

    if (withdrawAmount <= 0) {
        results.push({ name: 'Withdrawal Idempotency', passed: false, message: 'Insufficient balance for test' });
        return;
    }

    log(`  Initial Balance: ${initialBalance}, Amount: ${withdrawAmount}`);
    log(`  Idempotency Key: ${idempotencyKey}`);

    // First call
    const result1 = await callWithdraw(conn, accountId, withdrawAmount, 'Idempotency test withdrawal', idempotencyKey);
    const afterFirst = await getBalance(conn, accountId);
    log(`  First call: status=${result1.status}, txId=${result1.transactionId}, balance=${afterFirst}`);

    // Second call with same key
    const result2 = await callWithdraw(conn, accountId, withdrawAmount, 'Idempotency test withdrawal', idempotencyKey);
    const afterSecond = await getBalance(conn, accountId);
    log(`  Second call: status=${result2.status}, txId=${result2.transactionId}, message=${result2.message}, balance=${afterSecond}`);

    // Verify
    const txMatch = result1.transactionId === result2.transactionId;
    const balanceUnchanged = Math.abs(afterFirst - afterSecond) < 0.01;
    const correctDebit = Math.abs((initialBalance - withdrawAmount) - afterFirst) < 0.01;
    const isReplay = result2.message === 'Idempotent replay';

    const passed = txMatch && balanceUnchanged && correctDebit && isReplay;

    results.push({
        name: 'Withdrawal Idempotency',
        passed,
        message: passed
            ? `Idempotency works. Same txId (${result1.transactionId}) returned. Balance only decreased once.`
            : `Failed: txMatch=${txMatch}, balanceUnchanged=${balanceUnchanged}, correctDebit=${correctDebit}, isReplay=${isReplay}`
    });
}

// =============================================================================
// TEST 3: Concurrent Deposits (same key)
// =============================================================================
async function testConcurrentDeposits(pool: mysql.Pool, accountId: number) {
    log('TEST 3: Concurrent Deposits with Same Idempotency Key');

    const setupConn = await pool.getConnection();
    const initialBalance = await getBalance(setupConn, accountId);
    setupConn.release();

    const idempotencyKey = `idem-conc-${Date.now()}`;
    const depositAmount = 100;

    log(`  Initial Balance: ${initialBalance}, Amount: ${depositAmount}`);
    log(`  Idempotency Key: ${idempotencyKey}`);

    const parallelCount = 5;
    const promises = [];

    for (let i = 0; i < parallelCount; i++) {
        promises.push((async () => {
            const conn = await pool.getConnection();
            try {
                const result = await callDeposit(conn, accountId, depositAmount, `Parallel deposit ${i}`, idempotencyKey);
                log(`    Parallel ${i}: status=${result.status}, txId=${result.transactionId}, msg=${result.message}`);
                return result;
            } finally {
                conn.release();
            }
        })());
    }

    const allResults = await Promise.all(promises);

    const checkConn = await pool.getConnection();
    const finalBalance = await getBalance(checkConn, accountId);
    checkConn.release();

    log(`  Final Balance: ${finalBalance}`);

    // Check that all results have the same transaction ID
    const uniqueTxIds = new Set(allResults.map(r => r.transactionId));
    const allSameTxId = uniqueTxIds.size === 1;

    // Check that balance only increased once
    const correctBalance = Math.abs((initialBalance + depositAmount) - finalBalance) < 0.01;

    const passed = allSameTxId && correctBalance;

    results.push({
        name: 'Concurrent Deposits',
        passed,
        message: passed
            ? `All ${parallelCount} requests returned same txId. Balance: ${initialBalance} -> ${finalBalance}`
            : `Failed: uniqueTxIds=${uniqueTxIds.size}, correctBalance=${correctBalance}`
    });
}

// =============================================================================
// MAIN
// =============================================================================
async function main() {
    log('=== Starting Idempotency Verification ===\n');

    const pool = mysql.createPool({
        ...dbConfig,
        waitForConnections: true,
        connectionLimit: 20,
    });

    const conn = await pool.getConnection();

    try {
        // Check if procedures exist with new signature
        log('Checking procedure signatures...');
        try {
            await conn.query(`CALL sp_teller_deposit(1, 0.01, 'test', 1, 'test-key', @tx, @st, @msg)`);
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : String(error);
            if (errMsg.includes('Column count') || errMsg.includes('Incorrect number of arguments')) {
                log('ERROR: Stored procedures need to be updated. Run: npx ts-node scripts/migrate-idempotency.ts');
                return;
            }
            // Other errors are OK (like account not found)
        }
        log('  ✅ Procedures have correct signature\n');

        const account = await findTestAccount(conn);
        if (!account) {
            log('Cannot run tests without active accounts');
            return;
        }
        const { accountId } = account;
        log(`Using account ID: ${accountId}\n`);

        await testDepositIdempotency(conn, accountId);
        console.log('');

        await testWithdrawIdempotency(conn, accountId);
        console.log('');

        conn.release();

        await testConcurrentDeposits(pool, accountId);
        console.log('');

        log('=== VERIFICATION RESULTS ===');
        let allPassed = true;
        for (const r of results) {
            const icon = r.passed ? '✅' : '❌';
            console.log(`${icon} ${r.name}: ${r.message}`);
            if (!r.passed) allPassed = false;
        }
        console.log('');
        log(allPassed ? '✅ ALL IDEMPOTENCY TESTS PASSED' : '❌ SOME TESTS FAILED');

    } catch (error) {
        console.error('Verification failed with error:', error);
    } finally {
        await pool.end();
    }
}

main();

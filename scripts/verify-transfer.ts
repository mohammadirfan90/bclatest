/**
 * Verification Script for Atomic Transfers (sp_transfer) - Debug Version
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

async function findTestAccounts(conn: mysql.Connection): Promise<{ fromId: number; toId: number } | null> {
    const [accounts] = await conn.query<RowDataPacket[]>(
        `SELECT a.id, ab.available_balance
         FROM accounts a
         JOIN account_balances ab ON a.id = ab.account_id
         WHERE a.status = 'ACTIVE'
         ORDER BY ab.available_balance DESC
         LIMIT 10`
    );

    if (accounts.length < 2) {
        log('ERROR: Need at least 2 active accounts with balances for testing');
        return null;
    }

    return { fromId: accounts[0].id, toId: accounts[1].id };
}

async function callTransfer(
    conn: mysql.Connection,
    fromId: number,
    toId: number,
    amount: number,
    description: string,
    idempotencyKey: string
): Promise<{ transactionId: string | null; status: string; message: string }> {
    await conn.query(
        `CALL sp_transfer(?, ?, ?, ?, ?, NULL, @tx_id, @status, @msg)`,
        [fromId, toId, amount, description, idempotencyKey]
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

async function getBalance(conn: mysql.Connection, accountId: number): Promise<number> {
    const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT available_balance FROM account_balances WHERE account_id = ?`,
        [accountId]
    );
    return parseFloat(rows[0]?.available_balance || '0');
}

// =============================================================================
// TEST 1: Happy Path
// =============================================================================
async function testHappyPath(conn: mysql.Connection, fromId: number, toId: number) {
    log('TEST 1: Happy Path - Successful Transfer');

    const initialFrom = await getBalance(conn, fromId);
    const initialTo = await getBalance(conn, toId);
    const transferAmount = Math.min(100, initialFrom);

    log(`  Initial From: ${initialFrom}, To: ${initialTo}, Amount: ${transferAmount}`);

    if (transferAmount <= 0) {
        results.push({ name: 'Happy Path', passed: false, message: 'Source account has no balance' });
        return;
    }

    const result = await callTransfer(conn, fromId, toId, transferAmount, 'Test transfer', `idem-hp-${Date.now()}`);
    log(`  Result: status=${result.status}, message=${result.message}, txId=${result.transactionId}`);

    const finalFrom = await getBalance(conn, fromId);
    const finalTo = await getBalance(conn, toId);
    log(`  Final From: ${finalFrom}, To: ${finalTo}`);

    const passed = result.status === 'COMPLETED' &&
        Math.abs(finalFrom - (initialFrom - transferAmount)) < 0.01 &&
        Math.abs(finalTo - (initialTo + transferAmount)) < 0.01;

    results.push({
        name: 'Happy Path',
        passed,
        message: passed
            ? `Transfer of ${transferAmount} successful.`
            : `Transfer failed. Status: ${result.status}, Message: ${result.message}, From: ${initialFrom}->${finalFrom}, To: ${initialTo}->${finalTo}`
    });
}

// =============================================================================
// TEST 2: Insufficient Funds
// =============================================================================
async function testInsufficientFunds(conn: mysql.Connection, fromId: number, toId: number) {
    log('TEST 2: Insufficient Funds');

    const currentBalance = await getBalance(conn, fromId);
    const transferAmount = currentBalance + 1000000;

    const result = await callTransfer(conn, fromId, toId, transferAmount, 'Over limit', `idem-if-${Date.now()}`);
    log(`  Result: status=${result.status}, message=${result.message}`);

    const passed = result.status === 'FAILED' && result.message.toLowerCase().includes('insufficient');

    results.push({
        name: 'Insufficient Funds',
        passed,
        message: passed
            ? `Correctly rejected`
            : `Expected rejection, got: ${result.status} - ${result.message}`
    });
}

// =============================================================================
// TEST 3: Idempotency
// =============================================================================
async function testIdempotency(conn: mysql.Connection, fromId: number, toId: number) {
    log('TEST 3: Idempotency');

    const idempotencyKey = `idem-idp-${Date.now()}`;
    const initialFrom = await getBalance(conn, fromId);
    const transferAmount = Math.min(50, initialFrom);

    log(`  Idempotency Key: ${idempotencyKey}, Amount: ${transferAmount}`);

    if (transferAmount <= 0) {
        results.push({ name: 'Idempotency', passed: false, message: 'Source account has no balance' });
        return;
    }

    // First call
    const result1 = await callTransfer(conn, fromId, toId, transferAmount, 'Idempotency test', idempotencyKey);
    const afterFirst = await getBalance(conn, fromId);
    log(`  First call: status=${result1.status}, txId=${result1.transactionId}, balance=${afterFirst}`);

    // Second call with same key
    const result2 = await callTransfer(conn, fromId, toId, transferAmount, 'Idempotency test', idempotencyKey);
    const afterSecond = await getBalance(conn, fromId);
    log(`  Second call: status=${result2.status}, txId=${result2.transactionId}, balance=${afterSecond}`);

    // Transaction IDs should match and balance should only decrease once
    const txMatch = result1.transactionId === result2.transactionId;
    const balanceUnchanged = Math.abs(afterFirst - afterSecond) < 0.01;
    const correctDebit = Math.abs(initialFrom - afterFirst - transferAmount) < 0.01;

    const passed = txMatch && balanceUnchanged && correctDebit;

    results.push({
        name: 'Idempotency',
        passed,
        message: passed
            ? `Idempotency works. Same txId returned.`
            : `Failed: txMatch=${txMatch} (${result1.transactionId} vs ${result2.transactionId}), balanceUnchanged=${balanceUnchanged}, correctDebit=${correctDebit}`
    });
}

// =============================================================================
// TEST 4: Self Transfer
// =============================================================================
async function testSelfTransfer(conn: mysql.Connection, fromId: number) {
    log('TEST 4: Self Transfer');

    const result = await callTransfer(conn, fromId, fromId, 100, 'Self transfer', `idem-st-${Date.now()}`);
    log(`  Result: status=${result.status}, message=${result.message}`);

    const passed = result.status === 'FAILED' && result.message.toLowerCase().includes('same');

    results.push({
        name: 'Self Transfer',
        passed,
        message: passed
            ? `Correctly rejected`
            : `Expected rejection, got: ${result.status} - ${result.message}`
    });
}

// =============================================================================
// TEST 5: Concurrency
// =============================================================================
async function testConcurrency(pool: mysql.Pool, fromId: number, toId: number) {
    log('TEST 5: Concurrency');

    const setupConn = await pool.getConnection();
    const initialFrom = await getBalance(setupConn, fromId);
    const initialTo = await getBalance(setupConn, toId);
    setupConn.release();

    log(`  Initial From: ${initialFrom}, To: ${initialTo}`);

    const parallelCount = 5;
    const amountEach = 10;

    if (initialFrom < parallelCount * amountEach) {
        results.push({ name: 'Concurrency', passed: false, message: 'Not enough balance for concurrency test' });
        return;
    }

    const promises = [];
    for (let i = 0; i < parallelCount; i++) {
        promises.push((async () => {
            const conn = await pool.getConnection();
            try {
                const key = `idem-conc-${Date.now()}-${i}-${Math.random().toString(36).substring(7)}`;
                const result = await callTransfer(conn, fromId, toId, amountEach, `Parallel ${i}`, key);
                log(`    Parallel ${i}: status=${result.status}, msg=${result.message}`);
                return result;
            } finally {
                conn.release();
            }
        })());
    }

    const allResults = await Promise.all(promises);
    const successful = allResults.filter(r => r.status === 'COMPLETED').length;

    const checkConn = await pool.getConnection();
    const finalFrom = await getBalance(checkConn, fromId);
    const finalTo = await getBalance(checkConn, toId);
    checkConn.release();

    log(`  Final From: ${finalFrom}, To: ${finalTo}`);
    log(`  Successful transfers: ${successful}/${parallelCount}`);

    const expectedFromChange = successful * amountEach;
    const actualFromChange = initialFrom - finalFrom;
    const actualToChange = finalTo - initialTo;

    const passed = Math.abs(actualFromChange - expectedFromChange) < 0.01 &&
        Math.abs(actualToChange - expectedFromChange) < 0.01;

    results.push({
        name: 'Concurrency',
        passed,
        message: passed
            ? `${successful}/${parallelCount} completed. From: ${initialFrom}->${finalFrom}, To: ${initialTo}->${finalTo}`
            : `Mismatch! Expected change: ${expectedFromChange}, From changed: ${actualFromChange}, To changed: ${actualToChange}`
    });
}

// =============================================================================
// MAIN
// =============================================================================
async function main() {
    log('=== Starting Atomic Transfer Verification ===');

    const pool = mysql.createPool({
        ...dbConfig,
        waitForConnections: true,
        connectionLimit: 20,
    });

    const conn = await pool.getConnection();

    try {
        const accounts = await findTestAccounts(conn);
        if (!accounts) {
            log('Cannot run tests without active accounts');
            return;
        }
        const { fromId, toId } = accounts;
        log(`Using accounts: from=${fromId}, to=${toId}`);

        await testHappyPath(conn, fromId, toId);
        await testInsufficientFunds(conn, fromId, toId);
        await testIdempotency(conn, fromId, toId);
        await testSelfTransfer(conn, fromId);

        conn.release();

        await testConcurrency(pool, fromId, toId);

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
        await pool.end();
    }
}

main();

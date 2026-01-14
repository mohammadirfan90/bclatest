/**
 * Outbox Processor - Background Worker Script
 * 
 * Processes pending outbox items for reliable event delivery.
 * Run this script via cron or manually: `npx tsx scripts/process-outbox.ts`
 * 
 * Features:
 * - Batch processing of pending items
 * - Exponential backoff for retries
 * - Graceful error handling
 * - Console logging for monitoring
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import mysql, { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

// =============================================================================
// Configuration
// =============================================================================

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

const BATCH_SIZE = 10;
const MAX_RETRIES = 3;

// =============================================================================
// Types
// =============================================================================

interface OutboxItem {
    id: number;
    event_type: string;
    aggregate_type: string;
    aggregate_id: number;
    payload: Record<string, unknown>;
    status: string;
    retry_count: number;
    max_retries: number;
}

// =============================================================================
// Logging
// =============================================================================

function log(msg: string) {
    console.log(`[${new Date().toISOString()}] ${msg}`);
}

function logError(msg: string, error?: unknown) {
    console.error(`[${new Date().toISOString()}] ERROR: ${msg}`, error);
}

// =============================================================================
// Database Operations
// =============================================================================

async function getPendingItems(conn: mysql.Connection): Promise<OutboxItem[]> {
    const [rows] = await conn.query<(OutboxItem & RowDataPacket)[]>(
        `SELECT id, event_type, aggregate_type, aggregate_id, payload, status, retry_count, max_retries
         FROM outbox
         WHERE status = 'PENDING' AND scheduled_at <= NOW()
         ORDER BY created_at ASC
         LIMIT ?
         FOR UPDATE SKIP LOCKED`,
        [BATCH_SIZE]
    );
    return rows;
}

async function markProcessing(conn: mysql.Connection, ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await conn.query(
        `UPDATE outbox SET status = 'PROCESSING' WHERE id IN (${ids.join(',')})`,
        []
    );
}

async function markDelivered(conn: mysql.Connection, id: number): Promise<void> {
    await conn.query(
        `UPDATE outbox SET status = 'DELIVERED', processed_at = NOW() WHERE id = ?`,
        [id]
    );
}

async function markFailed(conn: mysql.Connection, id: number, error: string, retryCount: number): Promise<void> {
    const newStatus = retryCount >= MAX_RETRIES ? 'FAILED' : 'PENDING';
    const backoffMinutes = Math.pow(2, retryCount);

    await conn.query(
        `UPDATE outbox 
         SET status = ?, 
             retry_count = retry_count + 1,
             last_error = ?,
             scheduled_at = DATE_ADD(NOW(), INTERVAL ? MINUTE)
         WHERE id = ?`,
        [newStatus, error, backoffMinutes, id]
    );
}

// =============================================================================
// Event Handlers
// =============================================================================

async function handleTransferCompleted(conn: mysql.Connection, payload: Record<string, unknown>): Promise<void> {
    const { from_customer_id, to_customer_id, amount, transaction_id } = payload as {
        from_customer_id?: number;
        to_customer_id?: number;
        amount?: number;
        transaction_id?: number;
    };

    if (from_customer_id) {
        await conn.query(
            `INSERT INTO notifications (recipient_type, recipient_id, type, title, message, metadata)
             VALUES ('CUSTOMER', ?, 'TRANSFER_SENT', 'Transfer Sent', CONCAT('You have sent ৳', ?), ?)`,
            [from_customer_id, amount, JSON.stringify(payload)]
        );
        log(`  Notification sent to customer ${from_customer_id} for sent transfer ${transaction_id}`);
    }

    if (to_customer_id) {
        await conn.query(
            `INSERT INTO notifications (recipient_type, recipient_id, type, title, message, metadata)
             VALUES ('CUSTOMER', ?, 'TRANSFER_RECEIVED', 'Transfer Received', CONCAT('You have received ৳', ?), ?)`,
            [to_customer_id, amount, JSON.stringify(payload)]
        );
        log(`  Notification sent to customer ${to_customer_id} for received transfer ${transaction_id}`);
    }
}

async function handleDepositCompleted(conn: mysql.Connection, payload: Record<string, unknown>): Promise<void> {
    const { customer_id, amount, transaction_id } = payload as {
        customer_id?: number;
        amount?: number;
        transaction_id?: number;
    };

    if (customer_id) {
        await conn.query(
            `INSERT INTO notifications (recipient_type, recipient_id, type, title, message, metadata)
             VALUES ('CUSTOMER', ?, 'DEPOSIT', 'Deposit Received', CONCAT('৳', ?, ' has been deposited to your account'), ?)`,
            [customer_id, amount, JSON.stringify(payload)]
        );
        log(`  Notification sent to customer ${customer_id} for deposit ${transaction_id}`);
    }
}

async function handleWithdrawalCompleted(conn: mysql.Connection, payload: Record<string, unknown>): Promise<void> {
    const { customer_id, amount, transaction_id } = payload as {
        customer_id?: number;
        amount?: number;
        transaction_id?: number;
    };

    if (customer_id) {
        await conn.query(
            `INSERT INTO notifications (recipient_type, recipient_id, type, title, message, metadata)
             VALUES ('CUSTOMER', ?, 'WITHDRAWAL', 'Withdrawal Processed', CONCAT('৳', ?, ' has been withdrawn from your account'), ?)`,
            [customer_id, amount, JSON.stringify(payload)]
        );
        log(`  Notification sent to customer ${customer_id} for withdrawal ${transaction_id}`);
    }
}

async function processItem(conn: mysql.Connection, item: OutboxItem): Promise<void> {
    const payload = typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload;

    switch (item.event_type) {
        case 'TRANSFER_COMPLETED':
            await handleTransferCompleted(conn, payload);
            break;
        case 'DEPOSIT_COMPLETED':
            await handleDepositCompleted(conn, payload);
            break;
        case 'WITHDRAWAL_COMPLETED':
            await handleWithdrawalCompleted(conn, payload);
            break;
        default:
            log(`  No handler for event type: ${item.event_type}, marking as delivered`);
    }
}

// =============================================================================
// Main Processing Loop
// =============================================================================

async function processOutbox(): Promise<{ processed: number; failed: number }> {
    const conn = await mysql.createConnection(dbConfig);
    const result = { processed: 0, failed: 0 };

    try {
        // Start transaction for locking
        await conn.beginTransaction();

        // Get pending items with lock
        const items = await getPendingItems(conn);

        if (items.length === 0) {
            await conn.commit();
            return result;
        }

        // Mark as processing
        await markProcessing(conn, items.map(i => i.id));
        await conn.commit();

        // Process each item
        for (const item of items) {
            log(`Processing outbox item ${item.id} (${item.event_type})`);

            try {
                await processItem(conn, item);
                await markDelivered(conn, item.id);
                result.processed++;
                log(`  ✓ Delivered`);
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                await markFailed(conn, item.id, errorMsg, item.retry_count);
                result.failed++;
                logError(`  ✗ Failed: ${errorMsg}`);
            }
        }
    } catch (error) {
        logError('Outbox processing failed', error);
        await conn.rollback();
    } finally {
        await conn.end();
    }

    return result;
}

// =============================================================================
// Entry Point
// =============================================================================

async function main() {
    log('=== Outbox Processor Started ===');

    const startTime = Date.now();
    const result = await processOutbox();
    const duration = Date.now() - startTime;

    log('');
    log('=== Processing Complete ===');
    log(`Processed: ${result.processed}`);
    log(`Failed: ${result.failed}`);
    log(`Duration: ${duration}ms`);

    // Get remaining stats
    const conn = await mysql.createConnection(dbConfig);
    try {
        const [rows] = await conn.query<RowDataPacket[]>(
            `SELECT status, COUNT(*) as count FROM outbox GROUP BY status`
        );
        log('');
        log('Outbox Status:');
        for (const row of rows) {
            log(`  ${row.status}: ${row.count}`);
        }
    } finally {
        await conn.end();
    }
}

main().catch(error => {
    logError('Fatal error', error);
    process.exit(1);
});

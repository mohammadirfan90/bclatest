/**
 * Verification Script for Event Sourcing & Outbox Pattern
 * 
 * Tests:
 * 1. Event emission on financial operations
 * 2. Outbox record creation
 * 3. Event replay functionality
 * 4. API endpoints
 * 
 * Run: npx tsx scripts/verify-events.ts
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

// =============================================================================
// Types
// =============================================================================

interface TestResult {
    name: string;
    passed: boolean;
    message: string;
}

const results: TestResult[] = [];

// =============================================================================
// Logging
// =============================================================================

function log(msg: string) {
    console.log(`[${new Date().toISOString()}] ${msg}`);
}

// =============================================================================
// Tests
// =============================================================================

/**
 * TEST 1: Verify events table exists and has expected structure
 */
async function testEventsTableExists(conn: mysql.Connection) {
    log('TEST 1: Verify events table structure');

    try {
        const [rows] = await conn.query<RowDataPacket[]>(
            `DESCRIBE events`
        );

        const columns = rows.map(r => r.Field);
        const requiredColumns = ['id', 'event_type', 'aggregate_type', 'aggregate_id', 'payload', 'created_at'];
        const missing = requiredColumns.filter(c => !columns.includes(c));

        if (missing.length > 0) {
            results.push({
                name: 'Events Table Structure',
                passed: false,
                message: `Missing columns: ${missing.join(', ')}`
            });
        } else {
            results.push({
                name: 'Events Table Structure',
                passed: true,
                message: `All required columns present: ${requiredColumns.join(', ')}`
            });
        }
    } catch (error) {
        results.push({
            name: 'Events Table Structure',
            passed: false,
            message: `Error: ${error instanceof Error ? error.message : String(error)}`
        });
    }
}

/**
 * TEST 2: Verify outbox table exists and has expected structure
 */
async function testOutboxTableExists(conn: mysql.Connection) {
    log('TEST 2: Verify outbox table structure');

    try {
        const [rows] = await conn.query<RowDataPacket[]>(
            `DESCRIBE outbox`
        );

        const columns = rows.map(r => r.Field);
        const requiredColumns = ['id', 'event_type', 'aggregate_type', 'aggregate_id', 'payload', 'status', 'retry_count'];
        const missing = requiredColumns.filter(c => !columns.includes(c));

        if (missing.length > 0) {
            results.push({
                name: 'Outbox Table Structure',
                passed: false,
                message: `Missing columns: ${missing.join(', ')}`
            });
        } else {
            results.push({
                name: 'Outbox Table Structure',
                passed: true,
                message: `All required columns present: ${requiredColumns.join(', ')}`
            });
        }
    } catch (error) {
        results.push({
            name: 'Outbox Table Structure',
            passed: false,
            message: `Error: ${error instanceof Error ? error.message : String(error)}`
        });
    }
}

/**
 * TEST 3: Verify events are being created
 */
async function testEventsExist(conn: mysql.Connection) {
    log('TEST 3: Verify events exist in database');

    try {
        const [rows] = await conn.query<RowDataPacket[]>(
            `SELECT COUNT(*) as count FROM events`
        );

        const count = rows[0].count;

        if (count > 0) {
            const [typeRows] = await conn.query<RowDataPacket[]>(
                `SELECT event_type, COUNT(*) as count FROM events GROUP BY event_type`
            );
            const types = typeRows.map(r => `${r.event_type}: ${r.count}`).join(', ');

            results.push({
                name: 'Events Exist',
                passed: true,
                message: `Found ${count} events. Types: ${types}`
            });
        } else {
            results.push({
                name: 'Events Exist',
                passed: false,
                message: `No events found. Run some transactions to generate events.`
            });
        }
    } catch (error) {
        results.push({
            name: 'Events Exist',
            passed: false,
            message: `Error: ${error instanceof Error ? error.message : String(error)}`
        });
    }
}

/**
 * TEST 4: Verify outbox items exist
 */
async function testOutboxItems(conn: mysql.Connection) {
    log('TEST 4: Verify outbox items exist');

    try {
        const [rows] = await conn.query<RowDataPacket[]>(
            `SELECT status, COUNT(*) as count FROM outbox GROUP BY status`
        );

        const totalCount = rows.reduce((sum, r) => sum + r.count, 0);
        const statusSummary = rows.map(r => `${r.status}: ${r.count}`).join(', ');

        if (totalCount > 0) {
            results.push({
                name: 'Outbox Items Exist',
                passed: true,
                message: `Found ${totalCount} outbox items. Status breakdown: ${statusSummary}`
            });
        } else {
            results.push({
                name: 'Outbox Items Exist',
                passed: false,
                message: `No outbox items found. Run some transactions to generate outbox entries.`
            });
        }
    } catch (error) {
        results.push({
            name: 'Outbox Items Exist',
            passed: false,
            message: `Error: ${error instanceof Error ? error.message : String(error)}`
        });
    }
}

/**
 * TEST 5: Verify transfer creates events
 */
async function testTransferCreatesEvent(conn: mysql.Connection) {
    log('TEST 5: Verify transfer creates event and outbox entry');

    try {
        // Find two active accounts with balance
        const [accounts] = await conn.query<RowDataPacket[]>(
            `SELECT a.id, ab.available_balance
             FROM accounts a
             JOIN account_balances ab ON a.id = ab.account_id
             WHERE a.status = 'ACTIVE' AND ab.available_balance > 100
             LIMIT 2`
        );

        if (accounts.length < 2) {
            results.push({
                name: 'Transfer Creates Event',
                passed: false,
                message: 'Not enough active accounts with balance for test'
            });
            return;
        }

        const fromId = accounts[0].id;
        const toId = accounts[1].id;
        const amount = 10;

        // Get current event count
        const [beforeEvents] = await conn.query<RowDataPacket[]>(
            `SELECT COUNT(*) as count FROM events`
        );
        const eventCountBefore = beforeEvents[0].count;

        // Get current outbox count
        const [beforeOutbox] = await conn.query<RowDataPacket[]>(
            `SELECT COUNT(*) as count FROM outbox`
        );
        const outboxCountBefore = beforeOutbox[0].count;

        // Execute transfer
        const idempotencyKey = `verify-event-${Date.now()}`;
        await conn.query(
            `CALL sp_transfer(?, ?, ?, 'Event verification test', ?, NULL, @tx_id, @status, @msg)`,
            [fromId, toId, amount, idempotencyKey]
        );

        const [result] = await conn.query<RowDataPacket[]>(
            `SELECT @status as status, @msg as message`
        );

        if (result[0].status !== 'COMPLETED') {
            results.push({
                name: 'Transfer Creates Event',
                passed: false,
                message: `Transfer failed: ${result[0].message}`
            });
            return;
        }

        // Check event was created
        const [afterEvents] = await conn.query<RowDataPacket[]>(
            `SELECT COUNT(*) as count FROM events`
        );
        const eventCountAfter = afterEvents[0].count;

        // Check outbox was created
        const [afterOutbox] = await conn.query<RowDataPacket[]>(
            `SELECT COUNT(*) as count FROM outbox`
        );
        const outboxCountAfter = afterOutbox[0].count;

        const eventCreated = eventCountAfter > eventCountBefore;
        const outboxCreated = outboxCountAfter > outboxCountBefore;

        if (eventCreated && outboxCreated) {
            results.push({
                name: 'Transfer Creates Event',
                passed: true,
                message: `Transfer created event (${eventCountBefore} -> ${eventCountAfter}) and outbox entry (${outboxCountBefore} -> ${outboxCountAfter})`
            });
        } else {
            results.push({
                name: 'Transfer Creates Event',
                passed: false,
                message: `Event created: ${eventCreated}, Outbox created: ${outboxCreated}`
            });
        }
    } catch (error) {
        results.push({
            name: 'Transfer Creates Event',
            passed: false,
            message: `Error: ${error instanceof Error ? error.message : String(error)}`
        });
    }
}

/**
 * TEST 6: Verify event payload structure
 */
async function testEventPayloadStructure(conn: mysql.Connection) {
    log('TEST 6: Verify event payload structure');

    try {
        const [rows] = await conn.query<RowDataPacket[]>(
            `SELECT id, event_type, payload FROM events ORDER BY id DESC LIMIT 1`
        );

        if (rows.length === 0) {
            results.push({
                name: 'Event Payload Structure',
                passed: false,
                message: 'No events found to verify'
            });
            return;
        }

        const event = rows[0];
        const payload = typeof event.payload === 'string'
            ? JSON.parse(event.payload)
            : event.payload;

        const hasTransactionId = 'transaction_id' in payload;

        results.push({
            name: 'Event Payload Structure',
            passed: true,
            message: `Event ${event.id} (${event.event_type}) has valid JSON payload with keys: ${Object.keys(payload).join(', ')}`
        });
    } catch (error) {
        results.push({
            name: 'Event Payload Structure',
            passed: false,
            message: `Error: ${error instanceof Error ? error.message : String(error)}`
        });
    }
}

/**
 * TEST 7: Verify stored procedures emit events
 */
async function testStoredProceduresEmitEvents(conn: mysql.Connection) {
    log('TEST 7: Verify stored procedures are configured to emit events');

    try {
        const [rows] = await conn.query<RowDataPacket[]>(
            `SHOW CREATE PROCEDURE sp_transfer`
        );

        if (rows.length === 0) {
            results.push({
                name: 'Stored Procedures Emit Events',
                passed: false,
                message: 'sp_transfer procedure not found'
            });
            return;
        }

        const procedureBody = rows[0]['Create Procedure'] || '';
        const hasEventInsert = procedureBody.includes('INSERT INTO events');
        const hasOutboxInsert = procedureBody.includes('INSERT INTO outbox');

        if (hasEventInsert && hasOutboxInsert) {
            results.push({
                name: 'Stored Procedures Emit Events',
                passed: true,
                message: 'sp_transfer contains INSERT INTO events AND INSERT INTO outbox'
            });
        } else {
            results.push({
                name: 'Stored Procedures Emit Events',
                passed: false,
                message: `Events: ${hasEventInsert}, Outbox: ${hasOutboxInsert}`
            });
        }
    } catch (error) {
        results.push({
            name: 'Stored Procedures Emit Events',
            passed: false,
            message: `Error: ${error instanceof Error ? error.message : String(error)}`
        });
    }
}

// =============================================================================
// Main
// =============================================================================

async function main() {
    log('=== Event Sourcing & Outbox Pattern Verification ===');
    log('');

    const conn = await mysql.createConnection(dbConfig);

    try {
        await testEventsTableExists(conn);
        await testOutboxTableExists(conn);
        await testEventsExist(conn);
        await testOutboxItems(conn);
        await testTransferCreatesEvent(conn);
        await testEventPayloadStructure(conn);
        await testStoredProceduresEmitEvents(conn);

        log('');
        log('=== VERIFICATION RESULTS ===');
        log('');

        let allPassed = true;
        for (const r of results) {
            const icon = r.passed ? '✅' : '❌';
            console.log(`${icon} ${r.name}`);
            console.log(`   ${r.message}`);
            if (!r.passed) allPassed = false;
        }

        log('');
        log(allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED');

    } finally {
        await conn.end();
    }
}

main().catch(error => {
    console.error('Verification failed:', error);
    process.exit(1);
});

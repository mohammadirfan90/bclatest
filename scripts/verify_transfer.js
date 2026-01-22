
const mysql = require('mysql2/promise');
const path = require('path');
const dotenv = require('dotenv');

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function main() {
    const config = {
        host: process.env.DATABASE_HOST,
        user: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
        port: process.env.DATABASE_PORT || 3306,
        ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
        multipleStatements: true
    };

    let connection;
    try {
        connection = await mysql.createConnection(config);
        console.log('✅ Connected to DB.');

        // 1. Setup Test Data (Alice -> Bob)
        // Alice: Account 1, Bob: Account 3
        const fromAccountId = 1;
        const toAccountId = 3; 
        const amount = 50.00;
        const description = 'Test Transfer Script';
        const idempotencyKey = 'test-transfer-' + Date.now();
        const userId = 1; // Admin initiated

        console.log(`Testing sp_transfer: Account ${fromAccountId} -> Account ${toAccountId}, Amount ${amount}...`);

        // Check balances before
        const [fromBalBefore] = await connection.query("SELECT available_balance FROM account_balances WHERE account_id = ?", [fromAccountId]);
        const [toBalBefore] = await connection.query("SELECT available_balance FROM account_balances WHERE account_id = ?", [toAccountId]);
        
        console.log(`Balance Before - From: ${fromBalBefore[0].available_balance}, To: ${toBalBefore[0].available_balance}`);

        // Call Procedure
        const [result] = await connection.query(
            "CALL sp_transfer(?, ?, ?, ?, ?, ?, @p_tx_id, @p_status, @p_message); SELECT @p_tx_id, @p_status, @p_message;",
            [fromAccountId, toAccountId, amount, description, idempotencyKey, userId]
        );
        
        const out = result[1][0];
        console.log('Procedure Output:', out);

        if (out['@p_status'] === 'COMPLETED') {
             console.log('✅ Transfer Procedure Success.');
        } else {
             console.error('❌ Transfer Procedure Failed:', out['@p_message']);
        }

        // Check balances after
        const [fromBalAfter] = await connection.query("SELECT available_balance FROM account_balances WHERE account_id = ?", [fromAccountId]);
        const [toBalAfter] = await connection.query("SELECT available_balance FROM account_balances WHERE account_id = ?", [toAccountId]);
        
        console.log(`Balance After - From: ${fromBalAfter[0].available_balance}, To: ${toBalAfter[0].available_balance}`);

        // Verify correct movement
        const actualDiffFrom = parseFloat(fromBalBefore[0].available_balance) - parseFloat(fromBalAfter[0].available_balance);
        const actualDiffTo = parseFloat(toBalAfter[0].available_balance) - parseFloat(toBalBefore[0].available_balance);
        
        if (Math.abs(actualDiffFrom - amount) < 0.001 && Math.abs(actualDiffTo - amount) < 0.001) {
             console.log('✅ Balances updated correctly.');
        } else {
             console.error('❌ Balance mismatch!');
        }

    } catch (err) {
        console.error('💥 Error:', err);
    } finally {
        if (connection) await connection.end();
    }
}

main();

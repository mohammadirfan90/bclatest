
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Mimic the service function exactly (transpiled to JS logic)
async function transferService(connection, request) {
    const procedureName = 'sp_transfer';
    const inParams = [
        request.fromAccountId,
        request.toAccountId,
        request.amount,
        request.description || 'Fund Transfer',
        request.idempotencyKey || crypto.randomUUID(),
        request.performedBy,
    ];
    const outParamNames = ['p_transaction_id', 'p_status', 'p_message'];

    // Logic from db.ts callProcedure
    const inPlaceholders = inParams.map(() => '?').join(', ');
    const outPlaceholders = outParamNames.map((name) => `@${name}`).join(', ');
    const allPlaceholders = [inPlaceholders, outPlaceholders].filter(Boolean).join(', ');

    const callSql = `CALL ${procedureName}(${allPlaceholders})`;
    
    console.log(`Executing SQL: ${callSql}`);
    console.log(`Params:`, inParams);

    const [results] = await connection.query(callSql, inParams);

    // Get output parameters
    const outParams = {};
    if (outParamNames.length > 0) {
      const selectOutSql = `SELECT ${outParamNames.map((name) => `@${name} AS ${name}`).join(', ')}`;
      const [outRows] = await connection.query(selectOutSql);
      if (outRows[0]) {
        Object.assign(outParams, outRows[0]);
      }
    }
    
    return {
        success: outParams.p_status === 'COMPLETED',
        transactionId: outParams.p_transaction_id,
        status: outParams.p_status,
        message: outParams.p_message,
    };
}

async function main() {
    const config = {
        host: process.env.DATABASE_HOST,
        user: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
        port: process.env.DATABASE_PORT || 3306,
        ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    };

    let connection;
    try {
        connection = await mysql.createConnection(config);
        console.log('✅ Connected.');
        
        // Simulating the API route logic
        // 1. Get Accounts
        const fromAccountNumber = '1001-1000-6101'; // Robart's
        const toAccountNumber = '1001-0001-0001';   // Alice's
        const amount = 50.00;
        
        console.log(`Looking up accounts: From ${fromAccountNumber} -> To ${toAccountNumber}`);
        
        // Lookup logic
        const [destRows] = await connection.query("SELECT id FROM accounts WHERE account_number = ?", [toAccountNumber]);
        const destAccount = destRows[0];
        if (!destAccount) throw new Error('Dest account not found');

        const [sourceRows] = await connection.query("SELECT id FROM accounts WHERE account_number = ?", [fromAccountNumber]);
        const sourceAccount = sourceRows[0];
        if (!sourceAccount) throw new Error('Source account not found');
        
        // Simulation of req.user / req.customer
        const performedBy = 1000; // Customer ID for Robart (from previous output)

        console.log(`Transacting: SourceID=${sourceAccount.id}, DestID=${destAccount.id}, Amount=${amount}, By=${performedBy}`);

        const result = await transferService(connection, {
            fromAccountId: sourceAccount.id,
            toAccountId: destAccount.id,
            amount: amount,
            description: 'Debug Transfer',
            idempotencyKey: crypto.randomUUID(),
            performedBy: performedBy
        });

        console.log('Result:', result);

    } catch (err) {
        console.error('💥 Error:', err);
    } finally {
        if (connection) await connection.end();
    }
}

main();

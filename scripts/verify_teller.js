
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

        // 1. Verify Bank Cash Account
        const [cashRows] = await connection.query("SELECT * FROM accounts WHERE account_number = 'BANK-CASH-001'");
        if (cashRows.length === 0) {
            console.error('❌ BANK-CASH-001 account NOT found.');
        } else {
            console.log('✅ BANK-CASH-001 account found.');
        }

        // 2. Call sp_deposit
        const accountId = 1; // Alice
        const amount = 500;
        const description = 'Test Deposit Script';
        const userId = 2; // Banker

        console.log(`Testing sp_deposit for Account ${accountId}, Amount ${amount}...`);

        // Get balance before
        const [balanceBefore] = await connection.query("SELECT available_balance FROM account_balances WHERE account_id = ?", [accountId]);
        console.log('Balance before:', balanceBefore[0].available_balance);

        const [result] = await connection.query(
            "CALL sp_deposit(?, ?, ?, ?, @p_tx_id, @p_status, @p_message); SELECT @p_tx_id, @p_status, @p_message;",
            [accountId, amount, description, userId]
        );
        
        // result[0] is the CALL result (OKPacket)
        // result[1] is the SELECT result
        const out = result[1][0];
        console.log('Procedure Output:', out);

        if (out['@p_status'] === 'COMPLETED') {
             console.log('✅ Deposit Procedure Success.');
        } else {
             console.error('❌ Deposit Procedure Failed:', out['@p_message']);
        }

        // Get balance after
        const [balanceAfter] = await connection.query("SELECT available_balance FROM account_balances WHERE account_id = ?", [accountId]);
        console.log('Balance after:', balanceAfter[0].available_balance);
        
        // Verify Ledger
        const [ledger] = await connection.query("SELECT * FROM ledger_entries WHERE transaction_id = ?", [out['@p_tx_id']]);
        console.log('Ledger Entries generated:', ledger.length);
        if (ledger.length === 2) {
            console.log('✅ Double Entry verified (2 ledger entries).');
        } else {
             console.error('❌ Double Entry Failure:', ledger.length, 'entries found.');
        }


    } catch (err) {
        console.error('💥 Error:', err);
    } finally {
        if (connection) await connection.end();
    }
}

main();

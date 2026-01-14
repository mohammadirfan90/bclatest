const mysql = require('mysql2/promise');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

if (fs.existsSync(path.join(__dirname, '../.env.local'))) {
    dotenv.config({ path: path.join(__dirname, '../.env.local') });
} else {
    dotenv.config();
}

const getSSLConfig = () => {
    if (process.env.DATABASE_SSL !== 'true') return undefined;
    const certPath = path.join(__dirname, '../cert/DigiCertGlobalRootCA.crt');
    try {
        if (fs.existsSync(certPath)) {
            return { ca: fs.readFileSync(certPath), rejectUnauthorized: false };
        }
    } catch { }
    return { rejectUnauthorized: false };
};

const dbConfig = {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '3306'),
    user: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PASSWORD || '',
    database: process.env.DATABASE_NAME || 'bnkcore',
    ssl: getSSLConfig(),
    multipleStatements: true
};

async function verifyInterest() {
    console.log('🔄 Starting Interest Verification...');
    const conn = await mysql.createConnection(dbConfig);
    await conn.query("SET NAMES 'utf8mb4' COLLATE 'utf8mb4_unicode_ci'");

    try {
        // 1. Setup Test Data
        const testEmail = `test.interest.${Date.now()}@demo.local`;

        // Ensure 'CUSTOMER' role exists
        await conn.query(`INSERT IGNORE INTO roles (code, name, is_system) VALUES ('CUSTOMER', 'Customer', 0)`);

        // Create User
        await conn.query(`
            INSERT INTO users (email, password_hash, role_id, status, first_name, last_name)
            SELECT ?, 'hash', (SELECT id FROM roles WHERE code='CUSTOMER' LIMIT 1), 'ACTIVE', 'Interest', 'Test'
        `, [testEmail]);

        const [uResult] = await conn.query('SELECT id FROM users WHERE email = ?', [testEmail]);
        const userId = uResult[0].id;

        // Create Customer
        await conn.query(`
            INSERT INTO customers (user_id, first_name, last_name, email, phone, kyc_status, customer_number, status)
            VALUES (?, 'Interest', 'Test', ?, '+123456789', 'VERIFIED', ?, 'ACTIVE')
        `, [userId, testEmail, `CUS-${Date.now()}`]);

        const [cResult] = await conn.query('SELECT id FROM customers WHERE user_id = ?', [userId]);
        const customerId = cResult[0].id;

        // Create Account (Business = 1.5%)
        const accountNum = `ACC-${Date.now()}`;
        await conn.query(`
            INSERT INTO accounts (customer_id, account_number, account_type, currency, status)
            VALUES (?, ?, 'BUSINESS', 'BDT', 'ACTIVE')
        `, [customerId, accountNum]);

        const [aResult] = await conn.query('SELECT id FROM accounts WHERE account_number = ?', [accountNum]);
        const accountId = aResult[0].id;

        // Create Balance (BDT 1,000,000)
        await conn.query(`
            INSERT INTO account_balances (account_id, available_balance, currency, version)
            VALUES (?, 1000000.00, 'BDT', 1)
        `, [accountId]);

        // Fund System Expense Account
        await conn.query(`
            UPDATE account_balances ab
            JOIN accounts a ON a.id = ab.account_id
            SET ab.available_balance = 1000000000.00
            WHERE a.account_number = 'INT-EXPENSE-001'
        `);

        console.log(`✅ Test Account Created: ${accountNum} (ID: ${accountId}) | Balance: 1,000,000 BDT`);

        // 2. Call Daily Interest Calculation
        console.log('🔄 Running sp_calculate_daily_interest...');
        await conn.query('CALL sp_calculate_daily_interest(CURRENT_DATE(), @affected)');

        // 3. Verify Accrual
        const [accruals] = await conn.query(`
            SELECT * FROM accrued_interest 
            WHERE account_id = ? AND calculation_date = CURRENT_DATE()
        `, [accountId]);

        if (accruals.length === 0) throw new Error('No accrued interest record found!');

        const accrual = accruals[0];
        // Expected: 1,000,000 * 1.5% / 365 = 15000 / 365 = 41.09589...
        const expected = (1000000 * 0.015 / 365);
        const actual = parseFloat(accrual.interest_amount);

        if (Math.abs(actual - expected) > 0.01) {
            throw new Error(`Interest mismatch! Expected ~${expected}, Got ${actual}`);
        }
        console.log(`✅ Daily Interest Verified: ${actual} BDT (Expected ~${expected.toFixed(4)})`);

        // 4. Call Monthly Posting
        console.log('🔄 Running sp_post_monthly_interest...');
        // We run for TODAY's month.
        await conn.query('CALL sp_post_monthly_interest(CURRENT_DATE(), @posted, @count)');

        // 5. Verify Posting & Balance Update
        const [accrualPosted] = await conn.query(`
            SELECT is_posted, ledger_entry_id FROM accrued_interest 
            WHERE id = ?
        `, [accrual.id]);

        if (accrualPosted[0].is_posted !== 1) throw new Error('Accrual not marked as posted!');
        console.log('✅ Accrual marked as POSTED');

        // Check Balance
        const [bal] = await conn.query('SELECT available_balance FROM account_balances WHERE account_id = ?', [accountId]);
        const newBal = parseFloat(bal[0].available_balance);
        const expectedBal = 1000000 + actual; // Simple interest added

        if (Math.abs(newBal - expectedBal) > 0.01) {
            throw new Error(`Balance Mismatch! Expected ${expectedBal}, Got ${newBal}`);
        }
        console.log(`✅ Account Balance Updated: ${newBal} BDT`);

        // Check Expense Account
        const [expBal] = await conn.query(`
            SELECT ab.available_balance 
            FROM account_balances ab 
            JOIN accounts a ON a.id = ab.account_id 
            WHERE a.account_number = 'INT-EXPENSE-001'
        `);
        console.log(`ℹ️  Bank Expense Account Balance: ${expBal[0].available_balance} BDT`);

        // 6. Test Idempotency (Run Posting Again)
        console.log('🔄 Re-running sp_post_monthly_interest (Idempotency Test)...');
        // Capture balance before
        const balBefore = newBal;
        await conn.query('CALL sp_post_monthly_interest(CURRENT_DATE(), @posted, @count)');

        const [balAfter] = await conn.query('SELECT available_balance FROM account_balances WHERE account_id = ?', [accountId]);
        if (parseFloat(balAfter[0].available_balance) !== balBefore) {
            throw new Error('Idempotency Failed! Balance changed on re-run.');
        }
        console.log('✅ Idempotency Verified (No double posting)');

        console.log('🎉 INTEREST FEATURE VERIFIED SUCCESSFULLY!');

    } catch (e) {
        console.error('❌ Verification Failed:', e);
        process.exit(1);
    } finally {
        await conn.end();
    }
}

verifyInterest();

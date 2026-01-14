/**
 * Migration Script: Install Teller Stored Procedures
 * Creates sp_teller_deposit and sp_teller_withdraw with double-entry
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import mysql from 'mysql2/promise';

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
    multipleStatements: true,
};

// =====================================================
// sp_teller_deposit - Double-entry cash deposit
// =====================================================
const SP_TELLER_DEPOSIT = `
CREATE PROCEDURE sp_teller_deposit(
    IN p_account_id BIGINT UNSIGNED,
    IN p_amount DECIMAL(19,4),
    IN p_description VARCHAR(500),
    IN p_user_id BIGINT UNSIGNED,
    OUT p_transaction_id BIGINT UNSIGNED,
    OUT p_status VARCHAR(20),
    OUT p_message VARCHAR(500)
)
BEGIN
    DECLARE v_cash_account_id BIGINT UNSIGNED;
    DECLARE v_cash_balance DECIMAL(19,4);
    DECLARE v_customer_balance DECIMAL(19,4);
    DECLARE v_new_cash_balance DECIMAL(19,4);
    DECLARE v_new_customer_balance DECIMAL(19,4);
    DECLARE v_account_status VARCHAR(20);
    DECLARE v_transaction_ref VARCHAR(36);
    DECLARE v_transaction_type_id BIGINT UNSIGNED;
    DECLARE v_today DATE;
    DECLARE v_customer_id BIGINT UNSIGNED;
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_status = 'FAILED';
        SET p_message = 'Deposit failed due to a database error';
        SET p_transaction_id = NULL;
    END;
    
    SET v_today = CURDATE();
    SET p_transaction_id = NULL;
    SET p_status = 'PENDING';
    SET p_message = '';
    
    START TRANSACTION;
    
    IF p_amount <= 0 THEN
        SET p_status = 'FAILED';
        SET p_message = 'Amount must be greater than zero';
        ROLLBACK;
    ELSE
        SELECT id INTO v_cash_account_id FROM accounts WHERE account_number = 'BANK-CASH-001' LIMIT 1;
        
        IF v_cash_account_id IS NULL THEN
            SET p_status = 'FAILED';
            SET p_message = 'Bank cash account not found';
            ROLLBACK;
        ELSE
            SELECT available_balance INTO v_cash_balance
            FROM account_balances WHERE account_id = v_cash_account_id FOR UPDATE;
            
            SELECT ab.available_balance, a.status, a.customer_id
            INTO v_customer_balance, v_account_status, v_customer_id
            FROM account_balances ab
            INNER JOIN accounts a ON a.id = ab.account_id
            WHERE ab.account_id = p_account_id FOR UPDATE;
            
            IF v_account_status IS NULL THEN
                SET p_status = 'FAILED';
                SET p_message = 'Customer account not found';
                ROLLBACK;
            ELSEIF v_account_status != 'ACTIVE' THEN
                SET p_status = 'FAILED';
                SET p_message = 'Customer account is not active';
                ROLLBACK;
            ELSE
                SET v_new_cash_balance = v_cash_balance - p_amount;
                SET v_new_customer_balance = v_customer_balance + p_amount;
                SET v_transaction_ref = UUID();
                
                SELECT id INTO v_transaction_type_id FROM transaction_types WHERE code = 'DEPOSIT';
                IF v_transaction_type_id IS NULL THEN SET v_transaction_type_id = 2; END IF;
                
                INSERT INTO transactions (
                    transaction_reference, transaction_type_id, amount, currency, description, status,
                    source_account_id, destination_account_id, processed_at, created_by
                ) VALUES (
                    v_transaction_ref, v_transaction_type_id, p_amount, 'BDT', p_description, 'COMPLETED',
                    v_cash_account_id, p_account_id, NOW(), p_user_id
                );
                
                SET p_transaction_id = LAST_INSERT_ID();
                
                INSERT INTO ledger_entries (
                    transaction_id, account_id, entry_type, amount, currency, balance_after, description, entry_date
                ) VALUES (
                    p_transaction_id, v_cash_account_id, 'DEBIT', p_amount, 'BDT',
                    GREATEST(v_new_cash_balance, 0), CONCAT('Cash deposit to customer - ', p_description), v_today
                );
                
                INSERT INTO ledger_entries (
                    transaction_id, account_id, entry_type, amount, currency, balance_after, description, entry_date
                ) VALUES (
                    p_transaction_id, p_account_id, 'CREDIT', p_amount, 'BDT',
                    v_new_customer_balance, CONCAT('Cash deposit - ', p_description), v_today
                );
                
                UPDATE account_balances SET available_balance = v_new_cash_balance,
                    last_transaction_id = p_transaction_id, last_calculated_at = NOW(), version = version + 1
                WHERE account_id = v_cash_account_id;
                
                UPDATE account_balances SET available_balance = v_new_customer_balance,
                    last_transaction_id = p_transaction_id, last_calculated_at = NOW(), version = version + 1
                WHERE account_id = p_account_id;
                
                UPDATE accounts SET last_transaction_at = NOW() WHERE id IN (v_cash_account_id, p_account_id);
                
                INSERT INTO outbox (event_type, aggregate_type, aggregate_id, payload, status)
                VALUES ('DEPOSIT_COMPLETED', 'TRANSACTION', p_transaction_id,
                    JSON_OBJECT('transaction_id', p_transaction_id, 'transaction_reference', v_transaction_ref,
                        'account_id', p_account_id, 'amount', p_amount, 'customer_id', v_customer_id), 'PENDING');
                
                INSERT INTO events (event_type, aggregate_type, aggregate_id, payload)
                VALUES ('DEPOSIT_COMPLETED', 'TRANSACTION', p_transaction_id,
                    JSON_OBJECT('transaction_id', p_transaction_id, 'account_id', p_account_id,
                        'amount', p_amount, 'new_balance', v_new_customer_balance));
                
                COMMIT;
                SET p_status = 'COMPLETED';
                SET p_message = 'Deposit completed successfully';
            END IF;
        END IF;
    END IF;
END
`;

// =====================================================
// sp_teller_withdraw - Double-entry cash withdrawal
// =====================================================
const SP_TELLER_WITHDRAW = `
CREATE PROCEDURE sp_teller_withdraw(
    IN p_account_id BIGINT UNSIGNED,
    IN p_amount DECIMAL(19,4),
    IN p_description VARCHAR(500),
    IN p_user_id BIGINT UNSIGNED,
    OUT p_transaction_id BIGINT UNSIGNED,
    OUT p_status VARCHAR(20),
    OUT p_message VARCHAR(500)
)
BEGIN
    DECLARE v_cash_account_id BIGINT UNSIGNED;
    DECLARE v_cash_balance DECIMAL(19,4);
    DECLARE v_customer_balance DECIMAL(19,4);
    DECLARE v_new_cash_balance DECIMAL(19,4);
    DECLARE v_new_customer_balance DECIMAL(19,4);
    DECLARE v_account_status VARCHAR(20);
    DECLARE v_transaction_ref VARCHAR(36);
    DECLARE v_transaction_type_id BIGINT UNSIGNED;
    DECLARE v_today DATE;
    DECLARE v_customer_id BIGINT UNSIGNED;
    
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        ROLLBACK;
        SET p_status = 'FAILED';
        SET p_message = 'Withdrawal failed due to a database error';
        SET p_transaction_id = NULL;
    END;
    
    SET v_today = CURDATE();
    SET p_transaction_id = NULL;
    SET p_status = 'PENDING';
    SET p_message = '';
    
    START TRANSACTION;
    
    IF p_amount <= 0 THEN
        SET p_status = 'FAILED';
        SET p_message = 'Amount must be greater than zero';
        ROLLBACK;
    ELSE
        SELECT id INTO v_cash_account_id FROM accounts WHERE account_number = 'BANK-CASH-001' LIMIT 1;
        
        IF v_cash_account_id IS NULL THEN
            SET p_status = 'FAILED';
            SET p_message = 'Bank cash account not found';
            ROLLBACK;
        ELSE
            SELECT ab.available_balance, a.status, a.customer_id
            INTO v_customer_balance, v_account_status, v_customer_id
            FROM account_balances ab
            INNER JOIN accounts a ON a.id = ab.account_id
            WHERE ab.account_id = p_account_id FOR UPDATE;
            
            IF v_account_status IS NULL THEN
                SET p_status = 'FAILED';
                SET p_message = 'Customer account not found';
                ROLLBACK;
            ELSEIF v_account_status != 'ACTIVE' THEN
                SET p_status = 'FAILED';
                SET p_message = 'Customer account is not active';
                ROLLBACK;
            ELSEIF v_customer_balance < p_amount THEN
                SET p_status = 'FAILED';
                SET p_message = 'Insufficient balance';
                ROLLBACK;
            ELSE
                SELECT available_balance INTO v_cash_balance
                FROM account_balances WHERE account_id = v_cash_account_id FOR UPDATE;
                
                SET v_new_customer_balance = v_customer_balance - p_amount;
                SET v_new_cash_balance = v_cash_balance + p_amount;
                
                IF v_new_customer_balance < 0 THEN
                    SET p_status = 'FAILED';
                    SET p_message = 'Insufficient balance';
                    ROLLBACK;
                ELSE
                    SET v_transaction_ref = UUID();
                    
                    SELECT id INTO v_transaction_type_id FROM transaction_types WHERE code = 'WITHDRAWAL';
                    IF v_transaction_type_id IS NULL THEN SET v_transaction_type_id = 3; END IF;
                    
                    INSERT INTO transactions (
                        transaction_reference, transaction_type_id, amount, currency, description, status,
                        source_account_id, destination_account_id, processed_at, created_by
                    ) VALUES (
                        v_transaction_ref, v_transaction_type_id, p_amount, 'BDT', p_description, 'COMPLETED',
                        p_account_id, v_cash_account_id, NOW(), p_user_id
                    );
                    
                    SET p_transaction_id = LAST_INSERT_ID();
                    
                    INSERT INTO ledger_entries (
                        transaction_id, account_id, entry_type, amount, currency, balance_after, description, entry_date
                    ) VALUES (
                        p_transaction_id, p_account_id, 'DEBIT', p_amount, 'BDT',
                        v_new_customer_balance, CONCAT('Cash withdrawal - ', p_description), v_today
                    );
                    
                    INSERT INTO ledger_entries (
                        transaction_id, account_id, entry_type, amount, currency, balance_after, description, entry_date
                    ) VALUES (
                        p_transaction_id, v_cash_account_id, 'CREDIT', p_amount, 'BDT',
                        v_new_cash_balance, CONCAT('Cash withdrawal from customer - ', p_description), v_today
                    );
                    
                    UPDATE account_balances SET available_balance = v_new_customer_balance,
                        last_transaction_id = p_transaction_id, last_calculated_at = NOW(), version = version + 1
                    WHERE account_id = p_account_id;
                    
                    UPDATE account_balances SET available_balance = v_new_cash_balance,
                        last_transaction_id = p_transaction_id, last_calculated_at = NOW(), version = version + 1
                    WHERE account_id = v_cash_account_id;
                    
                    UPDATE accounts SET last_transaction_at = NOW() WHERE id IN (p_account_id, v_cash_account_id);
                    
                    INSERT INTO outbox (event_type, aggregate_type, aggregate_id, payload, status)
                    VALUES ('WITHDRAWAL_COMPLETED', 'TRANSACTION', p_transaction_id,
                        JSON_OBJECT('transaction_id', p_transaction_id, 'transaction_reference', v_transaction_ref,
                            'account_id', p_account_id, 'amount', p_amount, 'customer_id', v_customer_id), 'PENDING');
                    
                    INSERT INTO events (event_type, aggregate_type, aggregate_id, payload)
                    VALUES ('WITHDRAWAL_COMPLETED', 'TRANSACTION', p_transaction_id,
                        JSON_OBJECT('transaction_id', p_transaction_id, 'account_id', p_account_id,
                            'amount', p_amount, 'new_balance', v_new_customer_balance));
                    
                    COMMIT;
                    SET p_status = 'COMPLETED';
                    SET p_message = 'Withdrawal completed successfully';
                END IF;
            END IF;
        END IF;
    END IF;
END
`;

async function main() {
    console.log('=== Installing Teller Stored Procedures ===');

    const conn = await mysql.createConnection(dbConfig);

    try {
        // Drop existing procedures first
        console.log('Dropping existing procedures...');
        await conn.query('DROP PROCEDURE IF EXISTS sp_teller_deposit');
        await conn.query('DROP PROCEDURE IF EXISTS sp_teller_withdraw');

        // Create sp_teller_deposit
        console.log('Creating sp_teller_deposit...');
        await conn.query(SP_TELLER_DEPOSIT);
        console.log('  ✅ sp_teller_deposit created');

        // Create sp_teller_withdraw
        console.log('Creating sp_teller_withdraw...');
        await conn.query(SP_TELLER_WITHDRAW);
        console.log('  ✅ sp_teller_withdraw created');

        // Verify procedures exist
        const [procs] = await conn.query<any[]>(
            `SELECT ROUTINE_NAME FROM information_schema.ROUTINES 
             WHERE ROUTINE_SCHEMA = ? AND ROUTINE_NAME LIKE 'sp_teller_%'`,
            [process.env.DATABASE_NAME]
        );

        console.log('\n📋 Installed Procedures:');
        procs.forEach(p => console.log(`   - ${p.ROUTINE_NAME}`));

    } catch (error: any) {
        console.error('❌ Installation failed:', error.message);
        throw error;
    } finally {
        await conn.end();
    }
}

main();

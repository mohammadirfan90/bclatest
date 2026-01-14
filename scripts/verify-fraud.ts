
import dotenv from 'dotenv';
import path from 'path';

// Load env before other imports
dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function run() {
    console.log('🕵️ Starting Fraud Verification...');

    try {
        const { query, execute } = await import('../src/lib/db');
        const { FraudService } = await import('../src/lib/services/fraud-service');
        const { transfer, deposit } = await import('../src/lib/services/transaction-service');

        // 1. Setup Data - Create two temporary accounts for testing
        console.log('📝 Setting up test accounts...');

        // Helper to create account
        const createTestAccount = async (name: string) => {
            const num = `T${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 100)}`;
            const email = `${num}@test.local`;
            const res = await execute(`INSERT INTO customers (customer_number, email, password_hash, first_name, last_name, status) VALUES (?, ?, 'hash', ?, 'Test', 'ACTIVE')`, [num, email, name]);
            const customerId = (res as any).insertId;

            const accRes = await execute(`INSERT INTO accounts (account_number, customer_id, account_type, currency, status) VALUES (?, ?, 'SAVINGS', 'BDT', 'ACTIVE')`, [`A${num}`, customerId]);
            const accountId = (accRes as any).insertId;

            // Init balance record
            await execute(`INSERT INTO account_balances (account_id, available_balance, currency) VALUES (?, 0, 'BDT')`, [accountId]);

            return { customerId, accountId };
        };

        const sender = await createTestAccount('Sender');
        const receiver = await createTestAccount('Receiver');
        console.log(`   Sender: ${sender.accountId}, Receiver: ${receiver.accountId}`);

        // Deposit funds to sender
        console.log('💰 Depositing 1,000,000 BDT to sender...');
        await deposit({
            accountId: sender.accountId,
            amount: 1000000,
            description: 'Test Fund',
            userId: 1
        });

        console.log('Checking initial queue size...');
        const initialQueue = await FraudService.getQueue({ status: 'PENDING' });
        console.log(`Initial Pending Items: ${initialQueue.total}`);

        // Helper to get latest transaction
        const getLatestTxId = async (): Promise<number> => {
            const rows = await query<any[]>('SELECT id FROM transactions ORDER BY id DESC LIMIT 1');
            return rows[0]?.id;
        };

        // 2. Perform Safe Transfer
        console.log('\n--- Test 1: Safe Transfer (500 BDT) ---');
        const res1 = await transfer({
            fromAccountId: sender.accountId,
            toAccountId: receiver.accountId,
            amount: 500,
            description: 'Safe transfer',
            userId: 1
        });
        if (!res1.success) {
            console.error('Transfer failed:', res1.message);
        } else {
            const txId1 = await getLatestTxId();
            console.log(`  Transaction ID: ${txId1}`);
            await FraudService.evaluateTransaction(txId1);

            const queueAfterSafe = await FraudService.getQueue({ status: 'PENDING' });
            if (queueAfterSafe.total !== initialQueue.total) {
                console.error('❌ Safe transfer triggered fraud!');
            } else {
                console.log('✅ Safe transfer passed (no fraud alert).');
            }
        }

        // 3. Perform High Value Transfer
        console.log('\n--- Test 2: High Value Transfer (150,000 BDT) ---');
        const res2 = await transfer({
            fromAccountId: sender.accountId,
            toAccountId: receiver.accountId,
            amount: 150000,
            description: 'High value transfer',
            userId: 1
        });

        if (!res2.success) {
            console.error('Transfer failed:', res2.message);
        } else {
            const txId2 = await getLatestTxId();
            console.log(`  Transaction ID: ${txId2}`);
            await FraudService.evaluateTransaction(txId2);

            const queueAfterHigh = await FraudService.getQueue({ status: 'PENDING' });
            if (queueAfterHigh.total > initialQueue.total) {
                console.log('✅ High value transfer detected!');
                const newItem = queueAfterHigh.items[0];
                console.log(`   Captured: ${newItem.rule_triggered} (Score: ${newItem.fraud_score})`);
            } else {
                console.error('❌ High value transfer failed to trigger fraud!');
            }
        }

        // 4. Perform Critical Transfer
        console.log('\n--- Test 3: Critical Value Transfer (600,000 BDT) ---');
        const res3 = await transfer({
            fromAccountId: sender.accountId,
            toAccountId: receiver.accountId,
            amount: 600000,
            description: 'Critical transfer',
            userId: 1
        });

        if (!res3.success) {
            console.error('Transfer failed:', res3.message);
        } else {
            const txId3 = await getLatestTxId();
            console.log(`  Transaction ID: ${txId3}`);
            await FraudService.evaluateTransaction(txId3);

            const queueAfterCrit = await FraudService.getQueue({ status: 'PENDING' });
            const critItem = queueAfterCrit.items.find(i => i.transaction_id === txId3);

            if (critItem && (critItem.severity === 'HIGH' || critItem.severity === 'CRITICAL')) {
                console.log(`✅ Critical transfer detected with severity: ${critItem.severity}`);
            } else if (critItem) {
                console.log(`⚠️ Critical transfer detected but severity is ${critItem.severity}`);
            } else {
                console.error('❌ Critical transfer failed to trigger fraud!');
            }
        }

        console.log('\n📊 Final Queue Status:');
        const finalQueue = await FraudService.getQueue({ status: 'PENDING' });
        console.log(`   Total Pending: ${finalQueue.total}`);

    } catch (error) {
        console.error('Test Failed:', error);
    } finally {
        process.exit();
    }
}

run();


import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { deposit, transfer, withdraw, getLedgerEntries, verifyDoubleEntry } from '../src/lib/services/transaction-service';
import { query } from '../src/lib/db';
import { RowDataPacket } from 'mysql2';

async function main() {
    console.log('🔍 Starting Ledger Verification...');

    try {
        // 1. Setup Test Data
        // find a customer and account
        const [accounts] = await query<any[]>('SELECT id, customer_id FROM accounts WHERE status = "ACTIVE" LIMIT 2');

        if (accounts.length < 2) {
            console.error('❌ Need at least 2 active accounts to test transfer. Run seed first.');
            process.exit(1);
        }

        const account1 = accounts[0];
        const account2 = accounts[1];
        const userId = 1; // Assuming admin user ID 1

        console.log(`ℹ️ Testing with Account 1: ${account1.id} and Account 2: ${account2.id}`);

        // 2. Test Deposit
        console.log('\n🧪 Testing Deposit...');
        const depositAmount = 1000;
        const depositRes = await deposit({
            accountId: account1.id,
            amount: depositAmount,
            description: 'Test Deposit via Script',
            userId
        });

        if (!depositRes.success || !depositRes.transactionId) {
            throw new Error(`Deposit failed: ${depositRes.message}`);
        }
        console.log(`  ✅ Deposit success. Transaction ID: ${depositRes.transactionId}`);

        // Verify Double Entry
        const depositCheck = await verifyDoubleEntry(depositRes.transactionId);
        if (!depositCheck.valid) {
            throw new Error(`Double Entry Mismatch! Diff: ${depositCheck.difference}`);
        }
        console.log(`  ✅ Double Entry Balanced (Debits: ${depositCheck.totalDebits}, Credits: ${depositCheck.totalCredits})`);

        // 3. Test Transfer
        console.log('\n🧪 Testing Transfer...');
        const transferAmount = 250;
        const transferRes = await transfer({
            fromAccountId: account1.id,
            toAccountId: account2.id,
            amount: transferAmount,
            description: 'Test Transfer via Script',
            userId
        });

        if (!transferRes.success || !transferRes.transactionId) {
            throw new Error(`Transfer failed: ${transferRes.message}`);
        }
        console.log(`  ✅ Transfer success. Transaction ID: ${transferRes.transactionId}`);

        // Verify Double Entry
        const transferCheck = await verifyDoubleEntry(transferRes.transactionId);
        if (!transferCheck.valid) {
            throw new Error(`Double Entry Mismatch! Diff: ${transferCheck.difference}`);
        }
        console.log(`  ✅ Double Entry Balanced (Debits: ${transferCheck.totalDebits}, Credits: ${transferCheck.totalCredits})`);

        // 4. Test Ledger Query (Simulating API)
        console.log('\n🧪 Testing Ledger Query (API Simulation)...');
        const ledger1 = await getLedgerEntries({ accountId: account1.id, limit: 10 });

        const latestEntry1 = ledger1.entries.find(e => e.transactionId === transferRes.transactionId);
        if (!latestEntry1) {
            throw new Error('Ledger entry for transfer not found for Account 1');
        }
        console.log(`  ✅ Found ledger entry for Account 1: ${latestEntry1.entryType} ${latestEntry1.amount} (Bal: ${latestEntry1.balanceAfter})`);

        const ledger2 = await getLedgerEntries({ accountId: account2.id, limit: 10 });
        const latestEntry2 = ledger2.entries.find(e => e.transactionId === transferRes.transactionId);
        if (!latestEntry2) {
            throw new Error('Ledger entry for transfer not found for Account 2');
        }
        console.log(`  ✅ Found ledger entry for Account 2: ${latestEntry2.entryType} ${latestEntry2.amount} (Bal: ${latestEntry2.balanceAfter})`);

        // Verify Types
        if (latestEntry1.entryType !== 'DEBIT') throw new Error('Account 1 should have DEBIT for transfer out');
        if (latestEntry2.entryType !== 'CREDIT') throw new Error('Account 2 should have CREDIT for transfer in');
        console.log('  ✅ Entry Types Correct (Debit Sender, Credit Receiver)');

        console.log('\n🎉 ALL CHECKS PASSED. Ledger is functioning correctly.');
        process.exit(0);

    } catch (error) {
        console.error('\n❌ VERIFICATION FAILED:', error);
        process.exit(1);
    }
}

main();

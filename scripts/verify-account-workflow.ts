import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

// Imports moved to dynamic import inside main to ensure dotenv loads first

async function main() {
    console.log('🧪 Verifying Account Workflow...');

    // Dynamic import to ensure process.env is populated
    const dir = __dirname; // Ensure we are in verified context or just use relative path carefully
    const { getPool, closePool } = await import('../src/lib/db');
    const { applyForAccount, approveAccount, rejectAccount, freezeAccount, unfreezeAccount, closeAccount } = await import('../src/lib/services/account-service');

    const pool = getPool();

    try {
        // 1. Setup: Get a verified customer and a banker
        const [customers] = await pool.query<any>('SELECT id FROM customers WHERE kyc_status = "VERIFIED" LIMIT 1');
        const [bankers] = await pool.query<any>('SELECT id FROM users WHERE email LIKE "banker%" LIMIT 1');

        if (!customers.length || !bankers.length) {
            throw new Error('Test prerequisites missing (Verified Customer or Banker)');
        }

        const customerId = customers[0].id;
        const bankerId = bankers[0].id;
        console.log(`   Customer ID: ${customerId}, Banker ID: ${bankerId}`);

        // 2. Apply for Account
        console.log('Example: Applying for BUSINESS account...');
        const applyResult = await applyForAccount(customerId, 'BUSINESS');
        if (!applyResult.success || !applyResult.applicationId) {
            throw new Error(`Application failed: ${applyResult.error}`);
        }
        console.log(`   ✅ Application submitted. ID: ${applyResult.applicationId}`);

        // 3. Approve Account
        console.log('Example: Approving application...');
        const approveResult = await approveAccount(applyResult.applicationId, bankerId);
        if (!approveResult.success || !approveResult.accountId) {
            throw new Error(`Approval failed: ${approveResult.error}`);
        }
        console.log(`   ✅ Account approved. New Account ID: ${approveResult.accountId}, Number: ${approveResult.accountNumber}`);

        // 4. Verify Account State
        const [acc] = await pool.query<any>('SELECT * FROM accounts WHERE id = ?', [approveResult.accountId]);
        if (acc[0].status !== 'ACTIVE' || acc[0].balance_locked) {
            throw new Error('Account state mismatch after approval');
        }
        console.log('   ✅ Account is ACTIVE and unlocked');

        // 5. Freeze Account
        console.log('Example: Freezing account...');
        await freezeAccount(approveResult.accountId, bankerId, 'Suspicious activity test');
        const [frozenAcc] = await pool.query<any>('SELECT status, balance_locked FROM accounts WHERE id = ?', [approveResult.accountId]);
        if (frozenAcc[0].status !== 'SUSPENDED' || !frozenAcc[0].balance_locked) {
            throw new Error('Account freeze failed');
        }
        console.log('   ✅ Account frozen (SUSPENDED + Locked)');

        // 6. Unfreeze Account
        console.log('Example: Unfreezing account...');
        await unfreezeAccount(approveResult.accountId, bankerId, 'Verified safe');
        const [activeAcc] = await pool.query<any>('SELECT status, balance_locked FROM accounts WHERE id = ?', [approveResult.accountId]);
        if (activeAcc[0].status !== 'ACTIVE' || activeAcc[0].balance_locked) {
            throw new Error('Account unfreeze failed');
        }
        console.log('   ✅ Account unfrozen');

        // 7. Verify History (Audit)
        const [history] = await pool.query<any>('SELECT count(*) as count FROM accounts_history WHERE account_id = ?', [approveResult.accountId]);
        console.log(`   ✅ History records found: ${history[0].count}`);

        // 8. Close Account
        console.log('Example: Closing account...');
        await closeAccount(approveResult.accountId, bankerId, 'Customer request');
        const [closedAcc] = await pool.query<any>('SELECT status FROM accounts WHERE id = ?', [approveResult.accountId]);
        if (closedAcc[0].status !== 'CLOSED') {
            throw new Error('Account closure failed');
        }
        console.log('   ✅ Account closed');

        console.log('\n🎉 ALL CHECKS PASSED');

    } catch (error) {
        console.error('❌ Verification failed:', error);
        process.exit(1);
    } finally {
        await closePool();
    }
}

main();

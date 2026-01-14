import './setup-env';
// dotenv config moved to import for hoisting support

import { createReconciliation, importCsvItems, autoMatch, manualMatch, unmatch, closeReconciliation, getReconciliationById, getReconciliationItems } from '../src/lib/services/reconciliation-service';
import { execute, queryOne, RowDataPacket } from '../src/lib/db';
import { v4 as uuidv4 } from 'uuid';

// Mock system user
const SYSTEM_USER_ID = 1;

async function setupTestTransactions() {
    console.log('Setting up test transactions...');

    // Create an account for testing
    const accountId = 1; // Assuming account 1 exists (from seed)

    // Insert a transaction that matches exactly
    const tx1Ref = `TX-${uuidv4().substring(0, 8)}`;
    await execute(
        `INSERT INTO transactions (transaction_reference, transaction_type_id, amount, currency, description, status, source_account_id, created_at, processed_at)
         VALUES (?, 1, 150.00, 'BDT', 'Payment to Vendor A', 'COMPLETED', ?, NOW() - INTERVAL 1 DAY, NOW() - INTERVAL 1 DAY)`,
        [tx1Ref, accountId]
    );
    const tx1Id = (await queryOne<{ id: number } & RowDataPacket>('SELECT id FROM transactions WHERE transaction_reference = ?', [tx1Ref]))!.id;

    // Insert a transaction that is close in date and desc, but slightly different amount (should suggest or not match depending on strictness)
    // Actually our heuristic for amount is fairly strict (exact or penny diff).
    // Let's create one that SHOULD auto-match (exact match)

    // Insert another for fuzzy match (partial description)
    const tx2Ref = `TX-${uuidv4().substring(0, 8)}`;
    await execute(
        `INSERT INTO transactions (transaction_reference, transaction_type_id, amount, currency, description, status, source_account_id, created_at, processed_at)
         VALUES (?, 1, 500.00, 'BDT', 'Vendor B Payment', 'COMPLETED', ?, NOW() - INTERVAL 2 DAY, NOW() - INTERVAL 2 DAY)`,
        [tx2Ref, accountId]
    );
    const tx2Id = (await queryOne<{ id: number } & RowDataPacket>('SELECT id FROM transactions WHERE transaction_reference = ?', [tx2Ref]))!.id;

    return { tx1Id, tx1Ref, tx2Id, tx2Ref };
}

async function runVerification() {
    try {
        console.log('Starting Reconciliation Verification...');

        const { tx1Id, tx1Ref, tx2Id, tx2Ref } = await setupTestTransactions();

        // 1. Create Reconciliation
        console.log('\n1. Creating Reconciliation...');
        const reconciliation = await createReconciliation({
            name: `Test Verify ${new Date().toISOString()}`,
            source: 'TEST_SCRIPT',
            userId: SYSTEM_USER_ID
        });
        console.log('Reconciliation created:', reconciliation.id);

        // 2. Import CSV Items
        console.log('\n2. Importing CSV Items...');
        // CSV with:
        // Item 1: Exact match for TX1 ($150, date close, desc match)
        // Item 2: Match for TX2 ($500, date close, desc match)
        // Item 3: No match ($999)
        const csvContent = `Date,Description,Amount,Reference
${new Date().toISOString().split('T')[0]},Payment to Vendor A,150.00,REF-001
${new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0]},Payment to Vendor B,500.00,REF-002
${new Date().toISOString().split('T')[0]},Unknown Charge,999.00,REF-003`;

        const importResult = await importCsvItems(reconciliation.id, csvContent, SYSTEM_USER_ID);
        console.log('Import result:', importResult);

        // 3. Auto-Match
        console.log('\n3. Running Auto-Match...');
        const matchResult = await autoMatch(reconciliation.id, SYSTEM_USER_ID);
        console.log('Auto-match result:', matchResult);

        // Verify matches
        const items = await getReconciliationItems(reconciliation.id);
        const matchedItem = items.items.find(i => i.externalAmount === 150.00);
        const matchedItem2 = items.items.find(i => i.externalAmount === 500.00);
        const unmatchedItem = items.items.find(i => i.externalAmount === 999.00);

        if (matchedItem?.matchStatus === 'AUTO_MATCHED') {
            console.log('SUCCESS: Item 1 ($150) auto-matched correctly.');
        } else {
            console.error('FAILURE: Item 1 ($150) did not auto-match.', matchedItem);
        }

        if (matchedItem2?.matchStatus === 'AUTO_MATCHED') {
            console.log('SUCCESS: Item 2 ($500) auto-matched correctly.');
        } else {
            // Depending on implementation, might be suggested if description score isn't perfect.
            // Our heuristic: Amount=50, Date=30. Total 80. Need 85 for auto-match. Description needs 5 points.
            // Desc was "Vendor B Payment" vs "Payment to Vendor B". Levenshtein might give enough.
            console.log(`Item 2 status: ${matchedItem2?.matchStatus} (Confidence: ${matchedItem2?.matchConfidence})`);
        }

        // 4. Manual Match (if Item 2 didn't auto-match, or we unmatch and rematch)
        // Let's unmatch Item 1 to test unmatch
        console.log('\n4. Unmatching Item 1...');
        if (matchedItem) {
            await unmatch(reconciliation.id, matchedItem.id, 'Testing unmatch', SYSTEM_USER_ID);
            console.log('Item 1 unmatched.');
        }

        // 5. Manual Match Item 1 back to TX1
        console.log('\n5. Manual Matching Item 1...');
        if (matchedItem) {
            await manualMatch(reconciliation.id, matchedItem.id, tx1Id, SYSTEM_USER_ID);
            console.log('Item 1 manually matched.');
        }

        // 6. Close Reconciliation
        console.log('\n6. Closing Reconciliation...');
        await closeReconciliation(reconciliation.id, SYSTEM_USER_ID);

        const finalRecon = await getReconciliationById(reconciliation.id);
        if (finalRecon?.status === 'CLOSED') {
            console.log('SUCCESS: Reconciliation closed.');
        } else {
            console.error('FAILURE: Reconciliation status is', finalRecon?.status);
        }

        console.log('\nVerification Complete.');
        process.exit(0);
    } catch (error) {
        console.error('Verification Failed:', error);
        process.exit(1);
    }
}

runVerification();

// Script to generate password hashes for seed data
// Run with: npx ts-node scripts/generate-passwords.ts

import bcrypt from 'bcryptjs';

async function generateHashes() {
    const BCRYPT_ROUNDS = 10;

    const passwords = [
        { user: 'Staff Users', password: 'password123' },
        { user: 'Customers', password: 'customer123' },
    ];

    console.log('Generated Password Hashes:');
    console.log('='.repeat(80));

    for (const p of passwords) {
        const hash = await bcrypt.hash(p.password, BCRYPT_ROUNDS);
        console.log(`\n${p.user} (${p.password}):`);
        console.log(hash);
    }

    console.log('\n');
    console.log('SQL UPDATE statements:');
    console.log('='.repeat(80));

    const staffHash = await bcrypt.hash('password123', BCRYPT_ROUNDS);
    const customerHash = await bcrypt.hash('customer123', BCRYPT_ROUNDS);

    console.log(`
-- Run these in MySQL Workbench to fix passwords:
UPDATE users SET password_hash = '${staffHash}' WHERE email LIKE '%@bnkcore.com';
UPDATE customers SET password_hash = '${customerHash}' WHERE email LIKE '%@example.com';
`);
}

generateHashes().catch(console.error);

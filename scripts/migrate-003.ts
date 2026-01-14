import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { query, execute, closePool } from '../src/lib/db';
import fs from 'fs';
import path from 'path';

async function runMigration() {
    console.log('Running migration: 003_account_status_enum_fix');
    console.log('DB Host:', process.env.DATABASE_HOST);

    const migrationPath = path.join(process.cwd(), 'database/migrations/003_account_status_enum_fix.sql');
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');

    // Load db dynamically to ensure env vars? 
    // Should be fine as we import after config (wait, imports are hoisted).
    // But wait, the previous `migrate-002` used explicit connection.
    // Here I'm using `execute` from `lib/db`. 
    // I should check if `scripts/migrate-003.ts` works with static import if I use `npx tsx` and dotenv config.
    // The hoisting issue applies. I should use dynamic import OR `migrate-002` style.
    // I'll use dynamic import to be safe and consistent with my findings.

    const { execute, closePool } = await import('../src/lib/db');

    try {
        // Split statements since execute might not support multiple
        const statements = migrationSql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);


        for (const sql of statements) {
            console.log(`Executing: ${sql.substring(0, 50)}...`);
            await execute(sql);
        }

        console.log('Migration executed successfully.');

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        await closePool();
    }
}

runMigration();

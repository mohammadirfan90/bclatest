import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

async function installProcedures() {
    const config = {
        host: process.env.DATABASE_HOST,
        port: parseInt(process.env.DATABASE_PORT || '3306'),
        user: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
        multipleStatements: true,
        ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    };

    console.log('🔌 Connecting to database...');
    const connection = await mysql.createConnection(config);
    console.log('✅ Connected!');

    console.log('📖 Reading procedures.sql...');
    const procPath = path.join(process.cwd(), 'database', 'procedures', 'procedures.sql');
    let content = fs.readFileSync(procPath, 'utf8');

    // Extract individual procedure definitions using regex
    // Pattern: DROP PROCEDURE IF EXISTS name// followed by CREATE PROCEDURE...END//
    const procedureNames = [
        'sp_transfer',
        'sp_deposit',
        'sp_withdraw',
        'sp_reverse_transaction',
        'sp_post_monthly_interest',
        'sp_refresh_account_balances',
        'sp_eod_process',
        'sp_create_account_balance'
    ];

    console.log('📦 Installing stored procedures...');
    let successCount = 0;

    for (const procName of procedureNames) {
        try {
            // Drop existing procedure
            await connection.query(`DROP PROCEDURE IF EXISTS ${procName}`);
            console.log(`  ⬇️ Dropped ${procName} (if existed)`);

            // Find and extract the CREATE PROCEDURE statement
            const createRegex = new RegExp(
                `CREATE PROCEDURE ${procName}\\s*\\(([\\s\\S]*?)\\)\\s*BEGIN([\\s\\S]*?)END//`,
                'i'
            );

            const match = content.match(createRegex);
            if (match) {
                const params = match[1];
                const body = match[2];

                // Reconstruct the CREATE PROCEDURE statement without DELIMITER
                const createSQL = `CREATE PROCEDURE ${procName}(${params}) BEGIN${body}END`;

                await connection.query(createSQL);
                console.log(`  ✅ Created ${procName}`);
                successCount++;
            } else {
                console.log(`  ⚠️ Could not find ${procName} in procedures.sql`);
            }
        } catch (err: unknown) {
            const error = err as { message?: string; code?: string };
            console.error(`  ❌ Error with ${procName}: ${error.message?.substring(0, 100)}`);
        }
    }

    console.log('');
    console.log(`✅ Done! Installed ${successCount}/${procedureNames.length} procedures.`);
    await connection.end();
}

installProcedures().catch(console.error);

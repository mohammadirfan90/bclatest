/**
 * Database Reset Script
 * Drops ALL tables from the database
 * 
 * Usage: npx tsx scripts/reset-db.ts
 */

import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env.local or .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function resetDatabase() {
    console.log('🗑️  Database Reset Script');
    console.log('========================\n');

    const config = {
        host: process.env.DATABASE_HOST || 'localhost',
        port: parseInt(process.env.DATABASE_PORT || '3306'),
        user: process.env.DATABASE_USER || 'root',
        password: process.env.DATABASE_PASSWORD || '',
        database: process.env.DATABASE_NAME || 'bnkcore',
        ...(process.env.DATABASE_SSL === 'true' && {
            ssl: {
                rejectUnauthorized: true,
            },
        }),
    };

    console.log(`📡 Connecting to: ${config.host}:${config.port}`);
    console.log(`📦 Database: ${config.database}`);
    console.log(`👤 User: ${config.user}\n`);

    let connection: mysql.Connection | null = null;

    try {
        connection = await mysql.createConnection(config);
        console.log('✅ Connected successfully!\n');

        // Disable foreign key checks
        console.log('🔓 Disabling foreign key checks...');
        await connection.execute('SET FOREIGN_KEY_CHECKS = 0');

        // Get all tables
        console.log('📋 Fetching table list...\n');
        const [tables] = await connection.query<mysql.RowDataPacket[]>(
            `SELECT table_name FROM information_schema.tables 
       WHERE table_schema = ? AND table_type = 'BASE TABLE'`,
            [config.database]
        );

        if (tables.length === 0) {
            console.log('ℹ️  No tables found in database.\n');
        } else {
            console.log(`📊 Found ${tables.length} tables to drop:\n`);

            for (const table of tables) {
                const tableName = table.table_name || table.TABLE_NAME;
                console.log(`   🗑️  Dropping: ${tableName}`);
                await connection.execute(`DROP TABLE IF EXISTS \`${tableName}\``);
            }

            console.log(`\n✅ Successfully dropped ${tables.length} tables!`);
        }

        // Re-enable foreign key checks
        console.log('\n🔒 Re-enabling foreign key checks...');
        await connection.execute('SET FOREIGN_KEY_CHECKS = 1');

        console.log('\n🎉 Database reset complete!\n');
        console.log('Next steps:');
        console.log('  1. Run the schema: mysql -h <host> -u <user> -p <database> < database/schema/init.sql');
        console.log('  2. Seed demo data: npx tsx scripts/seed-demo.ts\n');

    } catch (error) {
        console.error('\n❌ Error:', error instanceof Error ? error.message : error);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
            console.log('🔌 Connection closed.');
        }
    }
}

// Run the script
resetDatabase();

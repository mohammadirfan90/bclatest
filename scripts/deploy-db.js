
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function main() {
    console.log('🔄 Sourcing .env.local...');
    const config = {
        host: process.env.DATABASE_HOST,
        user: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
        port: process.env.DATABASE_PORT || 3306,
        ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
        multipleStatements: true // Standard imports may use generic statements
    };

    console.log(`🔌 Connecting to ${config.host} as ${config.user}...`);

    let connection;
    try {
        connection = await mysql.createConnection(config);
        console.log('✅ Connected.');

        const sqlPath = path.resolve(__dirname, '../database/deploy_reset.sql');
        console.log(`📖 Reading ${sqlPath}...`);
        const sqlContent = fs.readFileSync(sqlPath, 'utf8');

        // Custom Parser for DELIMITER logic
        // We know the file has standard SQL, then DELIMITER //, then SPs with //, then DELIMITER ;

        // 1. Split into "Clean SQL" and "Procedure Blocks"
        const parts = sqlContent.split('DELIMITER //');

        // Part 0 is standard SQL (Table creation, seed data)
        const standardSql = parts[0];

        // Execute Standard SQL entries
        // We split by semicolon, but need to be careful about comments?
        // Actually, mysql2 can execute multiple statements provided they are simple.
        // But for robust progress tracking, let's split.
        // Or just execute the whole block? "CREATE DATABASE" might be tricky if we are already connected to it?
        // Wait, deploy_reset.sql contains `USE banking_core;`.
        // If we are connected to banking_core, `DROP DATABASE` checks might kill connection?
        // Actually, if we drop the DB we are connected to, connection might close.
        // We should connect with NO database first? Or just 'mysql' db?
        // But Azure MySQL might restrict that.

        // Let's rely on the script assuming the DB exists or we just run the queries ignoring the DROP DATABASE if it causes issues?
        // deploy_reset starts with:
        // DROP DATABASE IF EXISTS banking_core;
        // CREATE DATABASE banking_core ...
        // USE banking_core;

        // If I connect to 'banking_core' and drop it, trouble.
        // I will update config to NOT specify database initially?
        // But Azure requires `db_name` in connection string sometimes? 
        // Let's try connecting without database selected to be safe.
        // But `config.database` uses `process.env.DATABASE_NAME`.

        // Let's modify the standard SQL block to remove the DROP/CREATE logic and just DROP TABLES?
        // The script has it...

        // Let's try executing the whole standard block as one.
        console.log('🚀 Executing Tables & Seed Data...');
        await connection.query(standardSql);
        console.log('✅ Tables & Seeds created.');

        if (parts.length > 1) {
            console.log('⚡ Executing Store Procedures & Triggers...');
            // Part 1 contains SPs separated by // 
            // It ends with DELIMITER ;

            let procedureBlock = parts[1];
            // Remove the trailing DELIMITER ;
            procedureBlock = procedureBlock.split('DELIMITER ;')[0];

            // Split by //
            const procedures = procedureBlock.split('//');

            for (const proc of procedures) {
                const trimmed = proc.trim();
                if (trimmed) {
                    // console.log('Executing Procedure/Trigger...');
                    try {
                        await connection.query(trimmed);
                    } catch (e) {
                        console.error('❌ Error executing procedure block:', e.message);
                        console.error('Block:', trimmed.substring(0, 50) + '...');
                        throw e;
                    }
                }
            }
            console.log('✅ Stored Procedures & Triggers created.');
        }

        // Check for trailing standard SQL after DELIMITER ;
        // parts[1] might have stuff after 'DELIMITER ;'? 
        // standard split('DELIMITER //') gives [pre, post].
        // inside post, we split('DELIMITER ;').
        // [procedure_chunk, post_delimiter_chunk]

        const postDelimiterParts = parts[1].split('DELIMITER ;');
        if (postDelimiterParts.length > 1) {
            const finalSql = postDelimiterParts[1].trim();
            if (finalSql) {
                console.log('🔍 Executing Final Verification Queries...');
                // The verification queries are simple SELECTs.
                // We can run them.
                // However, mysql2 result format is [rows, fields].
                // We might just run them and ignore output or print it.
                /* 
                const verifications = finalSql.split(';');
                for (const v of verifications) {
                    if (v.trim()) await connection.query(v.trim());
                }
                */
                // Just execute
                await connection.query(finalSql);
                console.log('✅ Verification queries ran.');
            }
        }

        console.log('🎉 Database Reset Complete!');

    } catch (err) {
        console.error('💥 Fatal Error:', err);
        process.exit(1);
    } finally {
        if (connection) await connection.end();
    }
}

main();

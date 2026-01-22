
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

        // 1. Split into chunks by DELIMITER //
        // This handles cases where multiple procedures are defined in sequence
        const parts = sqlContent.split('DELIMITER //');

        // Part 0 is standard SQL (Tables, etc before the first proc)
        if (parts[0].trim()) {
            console.log('🚀 Executing Initial SQL Block...');
            await connection.query(parts[0]);
        }

        // Iterate through the rest of the parts
        for (let i = 1; i < parts.length; i++) {
            const part = parts[i];
            
            // Each part roughly looks like: " PROCEDURE ... END // DELIMITER ; \n MORE SQL "
            // But split('DELIMITER //') removed the first //
            // So it is " PROCEDURE ... END \n DELIMITER ; \n MORE SQL "
            
            // We split by 'DELIMITER ;' (or just '//' if the file format varies, but usually it's DELIMITER ;)
            // Note: The file might use '//' as the end delimiter for the proc itself if the file had `DELIMITER // ... // DELIMITER ;`
            // Let's rely on splitting by `DELIMITER ;` which usually follows.
            // OR if the `headers` said `DELIMITER //`, then the proc ends with `//`.
            // But `split` consumes the separator. 
            // If the file was: 
            // CREATE PROC ... END //
            // DELIMITER ;
            
            // Then `parts` split by `DELIMITER //` will capture `CREATE PROC ... END ` in the PREVIOUS part? 
            // No. `DELIMITER //` sets the delimiter.
            // Then `CREATE PROC ... END //` uses it.
            
            // Actually, the standard format is:
            // DELIMITER //
            // CREATE PROC ... //
            // DELIMITER ;
            
            // split('DELIMITER //') -> 
            // [0]: content BEFORE first DELIMITER //
            // [1]: content AFTER first DELIMITER // ( e.g. " \n CREATE PROC ... // \n DELIMITER ; ... ")
            
            // So inside parts[i], we accept the delimiter is now `//`.
            // We need to find the closing `//`.
            
            const procParts = part.split('//');
            
            // procParts[0] should be the procedure body.
            if (procParts[0].trim()) {
                // console.log('⚡ Executing Stored Procedure...');
                try {
                     await connection.query(procParts[0]);
                } catch (e) {
                     console.warn('⚠️ Procedure Error (ignoring):', e.message.substring(0, 100));
                }
            }
            
            // procParts[1] (and beyond) is what comes AFTER the `//`.
            // Usually it contains `DELIMITER ;` and then more standard SQL.
            // We should join the rest and look for `DELIMITER ;`
            
            const remainder = procParts.slice(1).join('//');
            const standardSqlParts = remainder.split('DELIMITER ;');
            
            // standardSqlParts[0] is usually just whitespace/newlines
            // standardSqlParts[1] is standard SQL after the reset
            
            for (let j = 1; j < standardSqlParts.length; j++) {
                const sql = standardSqlParts[j].trim();
                if (sql) {
                    await connection.query(sql);
                }
            }
        }
        
        console.log('✅ Executed all SQL blocks.');

        console.log('🎉 Database Reset Complete!');

    } catch (err) {
        console.error('💥 Fatal Error:', err);
        process.exit(1);
    } finally {
        if (connection) await connection.end();
    }
}

main();

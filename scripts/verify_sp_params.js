
const mysql = require('mysql2/promise');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

async function main() {
    const config = {
        host: process.env.DATABASE_HOST,
        user: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
        port: process.env.DATABASE_PORT || 3306,
        ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined
    };

    let connection;
    try {
        connection = await mysql.createConnection(config);
        console.log('✅ Connected.');

        const [rows] = await connection.query(`
            SELECT PARAMETER_NAME, DATA_TYPE, ORDINAL_POSITION 
            FROM INFORMATION_SCHEMA.PARAMETERS 
            WHERE SPECIFIC_NAME = 'sp_transfer' 
            ORDER BY ORDINAL_POSITION
        `);

        console.table(rows);
        
        if (rows.length === 9) { // 6 IN + 3 OUT
            console.log("✅ Parameter count matches (6 IN + 3 OUT).");
        } else {
            console.error(`❌ Parameter count mismatch. Found ${rows.length}, expected 9.`);
        }

    } catch (err) {
        console.error('💥 Error:', err);
    } finally {
        if (connection) await connection.end();
    }
}

main();

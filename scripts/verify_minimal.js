
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');
dotenv.config({ path: path.join(__dirname, '../.env.local') });

async function verify() {
    console.log('Verifying DB Schema...');
    const conn = await mysql.createConnection({
        host: process.env.DATABASE_HOST,
        user: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME,
        port: process.env.DATABASE_PORT || 3306,
        ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });
    
    try {
        const [allTables] = await conn.query("SHOW TABLES");
        console.log('Current Tables:', allTables.map(row => Object.values(row)[0]));
        
        const [cols] = await conn.query("DESCRIBE customers");
        const hasKyc = cols.some(c => c.Field === 'kyc_version');
        console.log('Has kyc_version:', hasKyc);
        
        const [tables] = await conn.query("SHOW TABLES LIKE 'idempotency_keys'");
        console.log('Has idempotency_keys:', tables.length > 0);
        
        const [users] = await conn.query("SELECT email, password_hash FROM users WHERE id=2");
        console.log('User Hash Prefix:', users[0].password_hash.substring(0, 10));
        
    } catch(e) { console.error(e); }
    finally { await conn.end(); }
}
verify();

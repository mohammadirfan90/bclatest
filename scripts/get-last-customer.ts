import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import mysql from 'mysql2/promise';

const config = {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '3306'),
    user: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PASSWORD || '',
    database: process.env.DATABASE_NAME || 'bnkcore',
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
};

async function main() {
    const connection = await mysql.createConnection(config);
    const [rows] = await connection.query('SELECT email FROM customers ORDER BY id DESC LIMIT 1') as [any[], any];
    console.log('LAST_EMAIL:', rows[0]?.email);
    await connection.end();
}
main();

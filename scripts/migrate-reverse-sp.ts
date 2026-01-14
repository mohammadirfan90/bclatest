import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config({ path: '.env.local' });

const getSSLConfig = () => {
    if (process.env.DATABASE_SSL !== 'true') return undefined;
    const certPath = path.join(process.cwd(), 'cert', 'DigiCertGlobalRootCA.crt');
    try {
        if (fs.existsSync(certPath)) {
            return { ca: fs.readFileSync(certPath), rejectUnauthorized: false };
        }
    } catch { /* ignore */ }
    return { rejectUnauthorized: false };
};

async function runMigration() {
    const connection = await mysql.createConnection({
        host: process.env.DATABASE_HOST || 'localhost',
        port: parseInt(process.env.DATABASE_PORT || '3306'),
        user: process.env.DATABASE_USER || 'root',
        password: process.env.DATABASE_PASSWORD || '',
        database: process.env.DATABASE_NAME || 'bnkcore',
        multipleStatements: true,
        ssl: getSSLConfig(),
    });

    console.log('Connected to database.');

    try {
        const migrationPath = path.join(process.cwd(), 'database/migrations/007_sp_reverse_transaction.sql');
        const sqlContent = fs.readFileSync(migrationPath, 'utf8');

        // Handle DELIMITER syntax
        const cleanContent = sqlContent
            .replace(/DELIMITER \/\//g, '')
            .replace(/DELIMITER ;/g, '')
            .trim();

        const statements = cleanContent.split('//')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        console.log(`Found ${statements.length} statements to execute.`);

        for (const stmt of statements) {
            if (!stmt) continue;
            console.log('Executing statement (truncated):', stmt.substring(0, 50) + '...');
            await connection.query(stmt);
        }

        console.log('sp_reverse_transaction migration successful.');

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        await connection.end();
    }
}

runMigration();

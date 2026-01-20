const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function checkTables() {
    const config = {
        host: 'banking-mysql-server.mysql.database.azure.com',
        port: 3306,
        user: 'banking_rg',
        password: 'IamIrfan1234',
        database: 'banking_core',
        ssl: {
            ca: fs.readFileSync(path.join(process.cwd(), 'cert', 'DigiCertGlobalRootCA.crt')),
            rejectUnauthorized: false
        }
    };

    let connection;
    try {
        connection = await mysql.createConnection(config);
        console.log('Connected to DB');

        const [tables] = await connection.query("SHOW TABLES LIKE 'daily_account_totals'");
        console.log('daily_account_totals exists:', tables.length > 0);

        const [months] = await connection.query("SHOW TABLES LIKE 'monthly_account_summaries'");
        console.log('monthly_account_summaries exists:', months.length > 0);

        process.exit(0);
    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    } finally {
        if (connection) await connection.end();
    }
}

checkTables();

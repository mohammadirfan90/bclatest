import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

// =============================================================================
// Configuration
// =============================================================================

const config = {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '3306'),
    user: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PASSWORD || '',
    database: process.env.DATABASE_NAME || 'bnkcore',
    multipleStatements: true,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
};

// =============================================================================
// Main Functions
// =============================================================================

async function runSchema(connection: mysql.Connection) {
    console.log('📦 Running schema...');
    const schemaPath = path.join(process.cwd(), 'database', 'schema', 'init.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Split by statement and run each (handling DELIMITER for procedures)
    const statements = schema.split(';').filter(s => s.trim());

    for (const statement of statements) {
        if (statement.trim()) {
            try {
                await connection.query(statement.trim() + ';');
            } catch (err: unknown) {
                const error = err as { code?: string; message?: string };
                // Ignore "already exists" errors
                if (!error.code?.includes('ER_TABLE_EXISTS') && !error.message?.includes('already exists')) {
                    console.warn(`  ⚠️ Statement warning: ${error.message}`);
                }
            }
        }
    }
    console.log('  ✅ Schema applied');
}

async function runProcedures(connection: mysql.Connection) {
    console.log('📦 Running stored procedures...');
    const procPath = path.join(process.cwd(), 'database', 'procedures', 'procedures.sql');
    const procedures = fs.readFileSync(procPath, 'utf8');

    // MySQL needs special handling for DELIMITER
    // We'll run this as a single multi-statement query
    try {
        await connection.query(procedures);
        console.log('  ✅ Stored procedures created');
    } catch (err: unknown) {
        const error = err as { message?: string };
        console.warn(`  ⚠️ Procedures warning: ${error.message}`);
    }
}

async function seedReferenceData(connection: mysql.Connection) {
    console.log('📦 Seeding reference data...');
    const seedPath = path.join(process.cwd(), 'database', 'seeds', 'reference-data.sql');
    const seeds = fs.readFileSync(seedPath, 'utf8');

    try {
        await connection.query(seeds);
        console.log('  ✅ Reference data seeded');
    } catch (err: unknown) {
        const error = err as { code?: string; message?: string };
        if (error.code === 'ER_DUP_ENTRY') {
            console.log('  ℹ️ Reference data already exists');
        } else {
            throw err;
        }
    }
}

async function createAdminUser(connection: mysql.Connection) {
    console.log('📦 Creating admin user...');

    // Check if admin exists
    const [existing] = await connection.query(
        `SELECT id FROM users WHERE email = ?`,
        ['admin@bankingcore.local']
    ) as [mysql.RowDataPacket[], unknown];

    if (existing.length > 0) {
        console.log('  ℹ️ Admin user already exists');
        return;
    }

    // Get admin role ID
    const [roles] = await connection.query(
        `SELECT id FROM roles WHERE code = 'ADMIN'`
    ) as [mysql.RowDataPacket[], unknown];

    if (roles.length === 0) {
        throw new Error('Admin role not found - run reference data seed first');
    }

    const roleId = roles[0].id;
    const passwordHash = await bcrypt.hash('Admin@123', 12);

    await connection.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role_id, status, password_changed_at)
     VALUES (?, ?, ?, ?, ?, 'ACTIVE', NOW())`,
        ['admin@bankingcore.local', passwordHash, 'System', 'Administrator', roleId]
    );

    console.log('  ✅ Admin user created');
    console.log('     Email: admin@bankingcore.local');
    console.log('     Password: Admin@123');
}

async function createBankerUser(connection: mysql.Connection) {
    console.log('📦 Creating banker user...');

    // Check if banker exists
    const [existing] = await connection.query(
        `SELECT id FROM users WHERE email = ?`,
        ['banker@bankingcore.local']
    ) as [mysql.RowDataPacket[], unknown];

    if (existing.length > 0) {
        console.log('  ℹ️ Banker user already exists');
        return;
    }

    // Get banker role ID
    const [roles] = await connection.query(
        `SELECT id FROM roles WHERE code = 'BANKER'`
    ) as [mysql.RowDataPacket[], unknown];

    if (roles.length === 0) {
        throw new Error('Banker role not found');
    }

    const roleId = roles[0].id;
    const passwordHash = await bcrypt.hash('Banker@123', 12);

    await connection.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, role_id, status, password_changed_at)
     VALUES (?, ?, ?, ?, ?, 'ACTIVE', NOW())`,
        ['banker@bankingcore.local', passwordHash, 'Demo', 'Banker', roleId]
    );

    console.log('  ✅ Banker user created');
    console.log('     Email: banker@bankingcore.local');
    console.log('     Password: Banker@123');
}

async function createDemoCustomer(connection: mysql.Connection) {
    console.log('📦 Creating demo customer...');

    // Check if customer exists
    const [existing] = await connection.query(
        `SELECT id FROM customers WHERE email = ?`,
        ['customer@demo.local']
    ) as [mysql.RowDataPacket[], unknown];

    if (existing.length > 0) {
        console.log('  ℹ️ Demo customer already exists');
        return;
    }

    const passwordHash = await bcrypt.hash('Customer@123', 12);
    const customerNumber = `C${Date.now().toString().slice(-10)}`;

    // Create customer
    const [result] = await connection.query(
        `INSERT INTO customers (customer_number, email, password_hash, first_name, last_name, phone, status, kyc_status)
     VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE', 'VERIFIED')`,
        [customerNumber, 'customer@demo.local', passwordHash, 'Demo', 'Customer', '+880123456789']
    ) as [mysql.ResultSetHeader, unknown];

    const customerId = result.insertId;

    // Get savings account type

    const accountNumber = `A${Date.now().toString().slice(-12)}`;

    // Create account
    const [accountResult] = await connection.query(
        `INSERT INTO accounts (account_number, customer_id, account_type, currency, status, opened_at, balance_locked)
     VALUES (?, ?, 'SAVINGS', 'BDT', 'ACTIVE', NOW(), FALSE)`,
        [accountNumber, customerId]
    ) as [mysql.ResultSetHeader, unknown];

    const accountId = accountResult.insertId;

    // Initialize balance with demo amount
    await connection.query(
        `INSERT INTO account_balances (account_id, available_balance, currency)
     VALUES (?, ?, 'BDT')`,
        [accountId, 100000] // ৳100,000 initial balance
    );

    console.log('  ✅ Demo customer created');
    console.log('     Email: customer@demo.local');
    console.log('     Password: Customer@123');
    console.log(`     Account: ${accountNumber}`);
    console.log('     Balance: ৳100,000');
}

// =============================================================================
// Main Execution
// =============================================================================

async function main() {
    console.log('');
    console.log('🏦 Banking Core - Database Setup');
    console.log('================================');
    console.log('');

    let connection: mysql.Connection | null = null;

    try {
        console.log(`📡 Connecting to MySQL at ${config.host}:${config.port}...`);
        connection = await mysql.createConnection(config);
        console.log('  ✅ Connected');
        console.log('');

        // Run setup steps
        await runSchema(connection);
        // Procedures need special handling - skip for now, will need to run manually
        // await runProcedures(connection);
        await seedReferenceData(connection);
        await createAdminUser(connection);
        await createBankerUser(connection);
        await createDemoCustomer(connection);

        console.log('');
        console.log('✅ Database setup complete!');
        console.log('');
        console.log('📝 Next steps:');
        console.log('   1. Run stored procedures manually from database/procedures/procedures.sql');
        console.log('   2. Start the development server: pnpm dev');
        console.log('   3. Login at http://localhost:3000/login');
        console.log('');

    } catch (error) {
        console.error('');
        console.error('❌ Setup failed:', error);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

main();

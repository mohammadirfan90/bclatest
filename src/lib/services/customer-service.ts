import { query, queryOne, execute } from '../db';
import { RowDataPacket } from 'mysql2/promise';

// =============================================================================
// Types
// =============================================================================

export interface Customer {
    id: number;
    customerNumber: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    dateOfBirth: Date | null;
    nationalId: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    postalCode: string | null;
    country: string;
    status: string;
    kycStatus: string;
    riskScore: number;
    createdAt: Date;
}

export interface CustomerWithAccounts extends Customer {
    accountCount: number;
    totalBalance: number;
}

export interface CreateCustomerRequest {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    dateOfBirth?: Date;
    nationalId?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    postalCode?: string;
    createdBy: number;
}

export interface UpdateCustomerRequest {
    firstName?: string;
    lastName?: string;
    phone?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    postalCode?: string;
}

// =============================================================================
// Customer Queries
// =============================================================================

interface CustomerRow extends RowDataPacket {
    id: number;
    customer_number: string;
    email: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    date_of_birth: Date | null;
    national_id: string | null;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    postal_code: string | null;
    country: string;
    status: string;
    kyc_status: string;
    risk_score: number;
    created_at: Date;
    account_count?: number;
    total_balance?: string;
}

function mapCustomerRow(row: CustomerRow): Customer {
    return {
        id: row.id,
        customerNumber: row.customer_number,
        email: row.email,
        firstName: row.first_name,
        lastName: row.last_name,
        phone: row.phone,
        dateOfBirth: row.date_of_birth,
        nationalId: row.national_id,
        addressLine1: row.address_line1,
        addressLine2: row.address_line2,
        city: row.city,
        postalCode: row.postal_code,
        country: row.country,
        status: row.status,
        kycStatus: row.kyc_status,
        riskScore: row.risk_score,
        createdAt: row.created_at,
    };
}

export async function getCustomerById(customerId: number): Promise<Customer | null> {
    const row = await queryOne<CustomerRow>(
        `SELECT id, customer_number, email, first_name, last_name, phone,
            date_of_birth, national_id, address_line1, address_line2,
            city, postal_code, country, status, kyc_status, risk_score, created_at
     FROM customers
     WHERE id = ?`,
        [customerId]
    );

    if (!row) return null;
    return mapCustomerRow(row);
}

export async function getCustomerByNumber(customerNumber: string): Promise<Customer | null> {
    const row = await queryOne<CustomerRow>(
        `SELECT id, customer_number, email, first_name, last_name, phone,
            date_of_birth, national_id, address_line1, address_line2,
            city, postal_code, country, status, kyc_status, risk_score, created_at
     FROM customers
     WHERE customer_number = ?`,
        [customerNumber]
    );

    if (!row) return null;
    return mapCustomerRow(row);
}

export async function getCustomerByEmail(email: string): Promise<Customer | null> {
    const row = await queryOne<CustomerRow>(
        `SELECT id, customer_number, email, first_name, last_name, phone,
            date_of_birth, national_id, address_line1, address_line2,
            city, postal_code, country, status, kyc_status, risk_score, created_at
     FROM customers
     WHERE email = ?`,
        [email]
    );

    if (!row) return null;
    return mapCustomerRow(row);
}

export async function searchCustomers(options: {
    search?: string;
    status?: string;
    kycStatus?: string;
    limit?: number;
    offset?: number;
}): Promise<{ customers: CustomerWithAccounts[]; total: number }> {
    const { search, status, kycStatus, limit = 50, offset = 0 } = options;

    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];

    if (search) {
        conditions.push(
            `(c.customer_number LIKE ? OR c.email LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ? OR c.national_id LIKE ?)`
        );
        const searchPattern = `%${search}%`;
        params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
    }

    if (status) {
        conditions.push('c.status = ?');
        params.push(status);
    }

    if (kycStatus) {
        conditions.push('c.kyc_status = ?');
        params.push(kycStatus);
    }

    const whereClause = conditions.join(' AND ');

    interface CountRow extends RowDataPacket {
        count: number;
    }
    const countRow = await queryOne<CountRow>(
        `SELECT COUNT(*) as count FROM customers c WHERE ${whereClause}`,
        params
    );

    const rows = await query<CustomerRow[]>(
        `SELECT c.id, c.customer_number, c.email, c.first_name, c.last_name, c.phone,
            c.date_of_birth, c.national_id, c.address_line1, c.address_line2,
            c.city, c.postal_code, c.country, c.status, c.kyc_status, c.risk_score, c.created_at,
            COUNT(a.id) as account_count,
            COALESCE(SUM(ab.available_balance), 0) as total_balance
     FROM customers c
     LEFT JOIN accounts a ON a.customer_id = c.id AND a.status = 'ACTIVE'
     LEFT JOIN account_balances ab ON ab.account_id = a.id
     WHERE ${whereClause}
     GROUP BY c.id
     ORDER BY c.created_at DESC
     LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );

    const customers = rows.map((row) => ({
        ...mapCustomerRow(row),
        accountCount: row.account_count || 0,
        totalBalance: parseFloat(row.total_balance || '0'),
    }));

    return { customers, total: countRow?.count || 0 };
}

// =============================================================================
// Customer Creation
// =============================================================================

import { hashPassword } from './auth-service';

export async function createCustomer(
    request: CreateCustomerRequest
): Promise<{ success: boolean; customerId?: number; customerNumber?: string; error?: string }> {
    // Check if email already exists
    const existing = await getCustomerByEmail(request.email);
    if (existing) {
        return { success: false, error: 'Email already exists' };
    }

    // Generate customer number
    const customerNumber = `C${Date.now().toString().slice(-10)}`;
    const passwordHash = await hashPassword(request.password);

    try {
        const result = await execute(
            `INSERT INTO customers (
         customer_number, email, password_hash, first_name, last_name, phone,
         date_of_birth, national_id, address_line1, address_line2,
         city, postal_code, status, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
            [
                customerNumber,
                request.email,
                passwordHash,
                request.firstName,
                request.lastName,
                request.phone || null,
                request.dateOfBirth || null,
                request.nationalId || null,
                request.addressLine1 || null,
                request.addressLine2 || null,
                request.city || null,
                request.postalCode || null,
                request.createdBy,
            ]
        );

        return { success: true, customerId: result.insertId, customerNumber };
    } catch (error) {
        console.error('Error creating customer:', error);
        return { success: false, error: 'Failed to create customer' };
    }
}

// =============================================================================
// Customer Updates
// =============================================================================

export async function updateCustomer(
    customerId: number,
    updates: UpdateCustomerRequest
): Promise<{ success: boolean; error?: string }> {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.firstName !== undefined) {
        fields.push('first_name = ?');
        values.push(updates.firstName);
    }
    if (updates.lastName !== undefined) {
        fields.push('last_name = ?');
        values.push(updates.lastName);
    }
    if (updates.phone !== undefined) {
        fields.push('phone = ?');
        values.push(updates.phone);
    }
    if (updates.addressLine1 !== undefined) {
        fields.push('address_line1 = ?');
        values.push(updates.addressLine1);
    }
    if (updates.addressLine2 !== undefined) {
        fields.push('address_line2 = ?');
        values.push(updates.addressLine2);
    }
    if (updates.city !== undefined) {
        fields.push('city = ?');
        values.push(updates.city);
    }
    if (updates.postalCode !== undefined) {
        fields.push('postal_code = ?');
        values.push(updates.postalCode);
    }

    if (fields.length === 0) {
        return { success: false, error: 'No fields to update' };
    }

    fields.push('updated_at = NOW()');
    values.push(customerId);

    await execute(
        `UPDATE customers SET ${fields.join(', ')} WHERE id = ?`,
        values
    );

    return { success: true };
}

// =============================================================================
// Customer Status Management
// =============================================================================

export async function updateCustomerStatus(
    customerId: number,
    newStatus: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'CLOSED'
): Promise<{ success: boolean; error?: string }> {
    const customer = await getCustomerById(customerId);
    if (!customer) {
        return { success: false, error: 'Customer not found' };
    }

    await execute(
        `UPDATE customers SET status = ?, updated_at = NOW() WHERE id = ?`,
        [newStatus, customerId]
    );

    return { success: true };
}

// =============================================================================
// KYC Management
// =============================================================================

export async function updateKycStatus(
    customerId: number,
    newStatus: 'NOT_STARTED' | 'PENDING' | 'VERIFIED' | 'REJECTED',
    verifiedBy?: number
): Promise<{ success: boolean; error?: string }> {
    const customer = await getCustomerById(customerId);
    if (!customer) {
        return { success: false, error: 'Customer not found' };
    }

    if (newStatus === 'VERIFIED' && verifiedBy) {
        await execute(
            `UPDATE customers SET kyc_status = ?, kyc_verified_at = NOW(), kyc_verified_by = ?, updated_at = NOW() WHERE id = ?`,
            [newStatus, verifiedBy, customerId]
        );

        // Also activate customer if pending
        if (customer.status === 'PENDING') {
            await updateCustomerStatus(customerId, 'ACTIVE');
        }
    } else {
        await execute(
            `UPDATE customers SET kyc_status = ?, updated_at = NOW() WHERE id = ?`,
            [newStatus, customerId]
        );
    }

    return { success: true };
}

// =============================================================================
// GDPR - Pseudonymization
// =============================================================================

export async function pseudonymizeCustomer(
    customerId: number,
    reason: string,
    pseudonymizedBy: number
): Promise<{ success: boolean; error?: string }> {
    const customer = await getCustomerById(customerId);
    if (!customer) {
        return { success: false, error: 'Customer not found' };
    }

    // Store original email hash for audit
    const crypto = await import('crypto');
    const emailHash = crypto.createHash('sha256').update(customer.email).digest('hex');

    // Pseudonymize customer data
    const pseudoEmail = `deleted-${customerId}@anonymized.local`;

    await execute(
        `UPDATE customers SET
       email = ?,
       first_name = 'REDACTED',
       last_name = 'USER',
       phone = NULL,
       date_of_birth = NULL,
       national_id = NULL,
       address_line1 = NULL,
       address_line2 = NULL,
       city = NULL,
       postal_code = NULL,
       status = 'CLOSED',
       updated_at = NOW()
     WHERE id = ?`,
        [pseudoEmail, customerId]
    );

    // Record pseudonymization
    await execute(
        `INSERT INTO customer_pseudonymizations (customer_id, original_email_hash, pseudonymized_by, reason)
     VALUES (?, ?, ?, ?)`,
        [customerId, emailHash, pseudonymizedBy, reason]
    );

    return { success: true };
}

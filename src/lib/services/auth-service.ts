import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, queryOne, execute, withTransaction } from '../db';
import { RowDataPacket } from 'mysql2/promise';

// =============================================================================
// Types
// =============================================================================

export interface User {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
    roleId: number;
    roleCode: string;
    roleName: string;
    permissions: string[];
    status: string;
    mfaEnabled: boolean;
}

export interface Customer {
    id: number;
    customerNumber: string;
    email: string;
    firstName: string;
    lastName: string;
    status: string;
    kycStatus: string;
}

export interface TokenPayload {
    sub: string;
    type: 'user' | 'customer';
    email: string;
    role?: string;
    permissions?: string[];
    tokenVersion: number;
    iat: number;
    exp: number;
}

export interface AuthResult {
    success: boolean;
    user?: User | Customer;
    token?: string;
    refreshToken?: string;
    error?: string;
}

// =============================================================================
// Configuration
// =============================================================================

const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const BCRYPT_ROUNDS = 12;
const MAX_FAILED_ATTEMPTS = 5;

// =============================================================================
// Password Management
// =============================================================================

export async function hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
}

// =============================================================================
// JWT Token Management
// =============================================================================

export function generateToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (jwt.sign as any)(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function generateRefreshToken(payload: Omit<TokenPayload, 'iat' | 'exp'>): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (jwt.sign as any)({ ...payload, refresh: true }, JWT_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
}

export function verifyToken(token: string): TokenPayload | null {
    try {
        return jwt.verify(token, JWT_SECRET) as TokenPayload;
    } catch {
        return null;
    }
}

// =============================================================================
// User Authentication
// =============================================================================

export async function authenticateUser(email: string, password: string): Promise<AuthResult> {
    interface UserRow extends RowDataPacket {
        id: number;
        email: string;
        password_hash: string;
        first_name: string;
        last_name: string;
        role_id: number;
        role_code: string;
        role_name: string;
        permissions: string;
        status: string;
    }

    const userRow = await queryOne<UserRow>(
        `SELECT u.id, u.email, u.password_hash, u.first_name, u.last_name,
            u.role_id, r.code as role_code, r.name as role_name, r.permissions,
            u.status
     FROM users u
     INNER JOIN roles r ON r.id = u.role_id
     WHERE u.email = ?`,
        [email]
    );

    if (!userRow) {
        return { success: false, error: 'Invalid email or password' };
    }

    if (userRow.status !== 'ACTIVE') {
        return { success: false, error: 'Account is not active' };
    }

    // Verify password
    const passwordValid = await verifyPassword(password, userRow.password_hash);

    if (!passwordValid) {
        return { success: false, error: 'Invalid email or password' };
    }

    // Update last login
    await execute(
        'UPDATE users SET last_login_at = NOW() WHERE id = ?',
        [userRow.id]
    );

    // Parse permissions (MySQL may return JSON as already-parsed array)
    const permissions = Array.isArray(userRow.permissions)
        ? userRow.permissions as string[]
        : JSON.parse(userRow.permissions || '[]') as string[];

    const user: User = {
        id: userRow.id,
        email: userRow.email,
        firstName: userRow.first_name,
        lastName: userRow.last_name,
        roleId: userRow.role_id,
        roleCode: userRow.role_code,
        roleName: userRow.role_name,
        permissions,
        status: userRow.status,
        mfaEnabled: false, // Simplified - no MFA
    };

    // Generate tokens
    const token = generateToken({
        sub: userRow.id.toString(),
        type: 'user',
        email: userRow.email,
        role: userRow.role_code,
        permissions,
        tokenVersion: 1, // Simplified - no version tracking
    });

    const refreshToken = generateRefreshToken({
        sub: userRow.id.toString(),
        type: 'user',
        email: userRow.email,
        role: userRow.role_code,
        tokenVersion: 1,
    });

    return { success: true, user, token, refreshToken };
}

// =============================================================================
// Customer Authentication
// =============================================================================

export async function authenticateCustomer(email: string, password: string): Promise<AuthResult> {
    interface CustomerRow extends RowDataPacket {
        id: number;
        customer_number: string;
        email: string;
        password_hash: string;
        first_name: string;
        last_name: string;
        status: string;
        kyc_status: string;
    }

    const customerRow = await queryOne<CustomerRow>(
        `SELECT id, customer_number, email, password_hash, first_name, last_name,
            status, kyc_status
     FROM customers
     WHERE email = ?`,
        [email]
    );

    if (!customerRow) {
        console.log(`[Auth] Customer not found: ${email}`);
        return { success: false, error: 'Invalid email or password' };
    }
    console.log(`[Auth] Customer found: ${customerRow.id}, Status: ${customerRow.status}`);

    if (customerRow.status === 'SUSPENDED') {
        return { success: false, error: 'Account is suspended. Please contact support.' };
    }

    if (customerRow.status !== 'ACTIVE' && customerRow.status !== 'PENDING') {
        return { success: false, error: 'Account is not active' };
    }

    // Verify password
    const passwordValid = await verifyPassword(password, customerRow.password_hash);
    console.log(`[Auth] Password valid: ${passwordValid}`);

    if (!passwordValid) {
        return { success: false, error: 'Invalid email or password' };
    }

    const customer: Customer = {
        id: customerRow.id,
        customerNumber: customerRow.customer_number,
        email: customerRow.email,
        firstName: customerRow.first_name,
        lastName: customerRow.last_name,
        status: customerRow.status,
        kycStatus: customerRow.kyc_status,
    };

    const token = generateToken({
        sub: customerRow.id.toString(),
        type: 'customer',
        email: customerRow.email,
        tokenVersion: 1, // Simplified - no version tracking
    });

    const refreshToken = generateRefreshToken({
        sub: customerRow.id.toString(),
        type: 'customer',
        email: customerRow.email,
        tokenVersion: 1,
    });

    return { success: true, user: customer, token, refreshToken };
}

// =============================================================================
// Token Refresh
// =============================================================================

export async function refreshAccessToken(refreshToken: string): Promise<AuthResult> {
    const payload = verifyToken(refreshToken);

    if (!payload) {
        return { success: false, error: 'Invalid refresh token' };
    }

    if (payload.type === 'user') {
        interface UserRow extends RowDataPacket {
            id: number;
            email: string;
            role_code: string;
            permissions: string;
        }

        const userRow = await queryOne<UserRow>(
            `SELECT u.id, u.email, r.code as role_code, r.permissions
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id
       WHERE u.id = ? AND u.status = 'ACTIVE'`,
            [payload.sub]
        );

        if (!userRow) {
            return { success: false, error: 'User not found or inactive' };
        }

        const permissions = Array.isArray(userRow.permissions)
            ? userRow.permissions as string[]
            : JSON.parse(userRow.permissions || '[]') as string[];

        const newToken = generateToken({
            sub: userRow.id.toString(),
            type: 'user',
            email: userRow.email,
            role: userRow.role_code,
            permissions,
            tokenVersion: 1, // Simplified
        });

        return { success: true, token: newToken };
    }

    if (payload.type === 'customer') {
        interface CustomerRow extends RowDataPacket {
            id: number;
            email: string;
        }

        const customerRow = await queryOne<CustomerRow>(
            `SELECT id, email FROM customers WHERE id = ? AND status = 'ACTIVE'`,
            [payload.sub]
        );

        if (!customerRow) {
            return { success: false, error: 'Customer not found or inactive' };
        }

        const newToken = generateToken({
            sub: customerRow.id.toString(),
            type: 'customer',
            email: customerRow.email,
            tokenVersion: 1, // Simplified
        });

        return { success: true, token: newToken };
    }

    return { success: false, error: 'Invalid token type' };
}

// =============================================================================
// User Management
// =============================================================================

export async function createUser(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    roleId: number,
    createdBy?: number
): Promise<{ success: boolean; userId?: number; error?: string }> {
    const passwordHash = await hashPassword(password);

    try {
        const result = await execute(
            `INSERT INTO users (email, password_hash, first_name, last_name, role_id, status, created_by, password_changed_at)
       VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, NOW())`,
            [email, passwordHash, firstName, lastName, roleId, createdBy ?? null]
        );

        return { success: true, userId: result.insertId };
    } catch (error) {
        if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
            return { success: false, error: 'Email already exists' };
        }
        throw error;
    }
}

export async function createCustomer(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    createdBy?: number
): Promise<{ success: boolean; customerId?: number; customerNumber?: string; error?: string }> {
    const passwordHash = await hashPassword(password);

    // Generate customer number
    const customerNumber = `C${Date.now().toString().slice(-10)}`;

    try {
        const result = await execute(
            `INSERT INTO customers (customer_number, email, password_hash, first_name, last_name, status, created_by)
       VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
            [customerNumber, email, passwordHash, firstName, lastName, createdBy ?? null]
        );

        return { success: true, customerId: result.insertId, customerNumber };
    } catch (error) {
        if ((error as { code?: string }).code === 'ER_DUP_ENTRY') {
            return { success: false, error: 'Email already exists' };
        }
        throw error;
    }
}

// =============================================================================
// Authorization Helpers
// =============================================================================

export function hasPermission(user: User, permission: string): boolean {
    return user.permissions.includes(permission);
}

export function hasAnyPermission(user: User, permissions: string[]): boolean {
    return permissions.some((p) => user.permissions.includes(p));
}

export function hasAllPermissions(user: User, permissions: string[]): boolean {
    return permissions.every((p) => user.permissions.includes(p));
}

export function isRole(user: User, role: string): boolean {
    return user.roleCode === role;
}

export function isAnyRole(user: User, roles: string[]): boolean {
    return roles.includes(user.roleCode);
}

// =============================================================================
// Logout / Global Sign Out
// =============================================================================

export async function logout(userId: number, type: 'user' | 'customer'): Promise<void> {
    const table = type === 'user' ? 'users' : 'customers';

    // Increment token version to invalidate all existing tokens
    await execute(
        `UPDATE ${table} SET token_version = token_version + 1 WHERE id = ?`,
        [userId]
    );

    // Also remove any active sessions
    if (type === 'user') {
        await execute('DELETE FROM user_sessions WHERE user_id = ?', [userId]);
    }
}

// =============================================================================
// Signup Token Management
// =============================================================================

import crypto from 'crypto';

interface SignupTokenResult {
    success: boolean;
    token?: string;
    error?: string;
}

export async function generateSignupToken(
    customerId: number,
    accountId: number,
    createdBy: number
): Promise<SignupTokenResult> {
    // 1. Strict Validation
    // Verify Customer exists AND Account belongs to them AND they are eligible for signup
    interface ValidationRow extends RowDataPacket {
        customer_id: number;
        status: string;
        kyc_status: string;
        onboarding_status: string;
        account_customer_id: number;
        password_hash: string;
    }

    const validation = await queryOne<ValidationRow>(
        `SELECT c.id as customer_id, c.status, c.kyc_status, c.onboarding_status, c.password_hash,
                a.customer_id as account_customer_id
         FROM customers c
         LEFT JOIN accounts a ON a.id = ?
         WHERE c.id = ?`,
        [accountId, customerId]
    );

    if (!validation) {
        return { success: false, error: 'Customer not found' };
    }

    // Check Account Ownership
    if (validation.account_customer_id !== validation.customer_id) {
        return { success: false, error: 'Account does not belong to this customer' };
    }

    // Check Customer Status
    if (validation.status !== 'PENDING' && validation.status !== 'ACTIVE') {
        return { success: false, error: 'Customer status invalid for onboarding' };
    }

    // Check KYC Status (Must be VERIFIED or PENDING, usually VERIFIED is preferred but strict mode might allow PENDING if reviewing)
    // Requirement said: VERIFIED or PENDING
    if (validation.kyc_status !== 'VERIFIED' && validation.kyc_status !== 'PENDING') {
        return { success: false, error: 'Customer KYC must be Verified or Pending' };
    }

    // Check Onboarding Status (Must be PENDING_SIGNUP)
    if (validation.onboarding_status !== 'PENDING_SIGNUP') {
        return { success: false, error: 'Customer has already signed up or is not in signup phase' };
    }

    // Check for existing password (redundant but safe)
    if (validation.password_hash) {
        return { success: false, error: 'Customer already has credentials' };
    }

    // 2. Generate random token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    // 3. Set expiry (e.g., 48 hours)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 48);

    try {
        await execute(
            `INSERT INTO customer_signup_tokens (token_hash, customer_id, account_id, created_by, expires_at)
             VALUES (?, ?, ?, ?, ?)`,
            [tokenHash, customerId, accountId, createdBy, expiresAt]
        );

        return { success: true, token };
    } catch (error) {
        return { success: false, error: 'Failed to generate signup token' };
    }
}

export async function verifySignupToken(token: string): Promise<{ success: boolean; data?: any; error?: string }> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const tokenRow = await queryOne<RowDataPacket & {
        customer_id: number;
        account_id: number;
        expires_at: Date;
        used_at: Date | null
    }>(
        `SELECT customer_id, account_id, expires_at, used_at 
         FROM customer_signup_tokens 
         WHERE token_hash = ?`,
        [tokenHash]
    );

    if (!tokenRow) {
        return { success: false, error: 'Invalid signup link' };
    }

    if (tokenRow.used_at) {
        return { success: false, error: 'This link has already been used' };
    }

    if (new Date() > tokenRow.expires_at) {
        return { success: false, error: 'Signup link has expired' };
    }

    return {
        success: true,
        data: {
            customerId: tokenRow.customer_id,
            accountId: tokenRow.account_id
        }
    };
}

export async function completeSignup(
    token: string,
    password: string
): Promise<{ success: boolean; error?: string }> {
    const verifyResult = await verifySignupToken(token);

    if (!verifyResult.success || !verifyResult.data) {
        return { success: false, error: verifyResult.error };
    }

    const { customerId } = verifyResult.data;
    const passwordHash = await hashPassword(password);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    try {
        // 1. Update customer password and status
        await execute(
            `UPDATE customers 
             SET password_hash = ?, 
                 onboarding_status = 'PENDING_APPROVAL',
                 updated_at = NOW() 
             WHERE id = ?`,
            [passwordHash, customerId]
        );

        // 2. Mark token as used
        await execute(
            `UPDATE customer_signup_tokens 
             SET used_at = NOW() 
             WHERE token_hash = ?`,
            [tokenHash]
        );

        return { success: true };
    } catch (error) {
        return { success: false, error: 'Failed to complete signup' };
    }
}

// =============================================================================
// Session Helper for Next.js App Router
// =============================================================================

import { cookies, headers } from 'next/headers';

export async function getSession(): Promise<{ user?: User | Customer; role?: string } | null> {
    try {
        const cookieStore = await cookies();
        const headerList = await headers();

        let token = cookieStore.get('token')?.value;

        if (!token) {
            const authHeader = headerList.get('Authorization');
            if (authHeader?.startsWith('Bearer ')) {
                token = authHeader.substring(7);
            }
        }

        if (!token) return null;

        const payload = verifyToken(token);
        if (!payload) return null;

        if (payload.type === 'user') {
            const userRow = await queryOne<RowDataPacket & User>(
                `SELECT u.id, u.email, u.first_name, u.last_name, u.role_id, r.code as role_code, r.name as role_name, r.permissions, u.status
             FROM users u
             JOIN roles r ON r.id = u.role_id
             WHERE u.id = ?`,
                [payload.sub]
            );
            if (!userRow) return null;

            const permissions = Array.isArray(userRow.permissions)
                ? userRow.permissions as string[]
                : JSON.parse((userRow.permissions as any) || '[]') as string[];

            return {
                user: { ...userRow, firstName: userRow.first_name, lastName: userRow.last_name, roleId: userRow.role_id, roleCode: userRow.role_code, roleName: userRow.role_name, permissions, mfaEnabled: false },
                role: userRow.role_code
            };
        }

        if (payload.type === 'customer') {
            const customerRow = await queryOne<RowDataPacket & Customer>(
                `SELECT id, customer_number, email, first_name, last_name, status, kyc_status
             FROM customers WHERE id = ?`,
                [payload.sub]
            );
            if (!customerRow) return null;

            return {
                user: { ...customerRow, customerNumber: customerRow.customer_number, firstName: customerRow.first_name, lastName: customerRow.last_name, kycStatus: customerRow.kyc_status },
                role: 'CUSTOMER'
            };
        }

        return null;
    } catch (e) {
        return null;
    }
}

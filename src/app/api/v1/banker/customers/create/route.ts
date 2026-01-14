
import { NextRequest } from 'next/server';
import {
    withErrorHandler,
    withAuth,
    successResponse,
    errorResponse,
    AuthenticatedRequest,
    validationErrorResponse,
} from '@/lib/api-utils';
import { execute, queryOne } from '@/lib/db';
import { z } from 'zod';
import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';

const createCustomerSchema = z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    dateOfBirth: z.string(),
    customerNumber: z.string().min(1),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
    return withAuth(request, async (req: AuthenticatedRequest) => {
        // 1. Verify Role
        const { user } = req;
        if (!user || user.roleCode !== 'BANKER' && user.roleCode !== 'ADMIN') {
            return errorResponse('Unauthorized', 403);
        }

        // 2. Parse Body
        const body = await request.json();
        const result = createCustomerSchema.safeParse(body);

        if (!result.success) {
            return validationErrorResponse(result.error.issues.map(e => ({ field: e.path.join('.'), message: e.message })));
        }

        const { firstName, lastName, email, dateOfBirth, customerNumber } = result.data;

        // 3. Check for existing customer
        const existing = await queryOne<RowDataPacket & { id: number }>(
            'SELECT id FROM customers WHERE email = ? OR customer_number = ?',
            [email, customerNumber]
        );

        if (existing) {
            return errorResponse('Customer with this email or CIF/Number already exists', 409);
        }

        // 4. Create Customer
        // status='PENDING' (global), onboarding_status='PENDING_SIGNUP'
        // password_hash is NULL
        const insertRes = await execute(
            `INSERT INTO customers 
            (customer_number, email, first_name, last_name, date_of_birth, status, kyc_status, onboarding_status, created_at, created_by, password_hash)
            VALUES (?, ?, ?, ?, ?, 'PENDING', 'NOT_STARTED', 'PENDING_SIGNUP', NOW(), ?, NULL)`,
            [customerNumber, email, firstName, lastName, dateOfBirth, user.id]
        );

        const customerId = insertRes.insertId;

        // 5. Create Default Account (Savings)
        // We assume 'SAVINGS' account type exists. If not, this might fail or we should verify first.
        // Ideally we fetch the ID for 'SAVINGS' code.
        const accountType = await queryOne<RowDataPacket & { id: number }>(
            "SELECT id FROM account_types WHERE code = 'SAVINGS'"
        );

        if (accountType) {
            // Generate Account Number (Mock logic or simple random for now)
            const accountNumber = '10' + Math.floor(Math.random() * 90000000);

            await execute(
                `INSERT INTO accounts
                (customer_id, account_type_id, account_number, balance, currency, status, created_at)
                VALUES (?, ?, ?, 0.00, 'BDT', 'PENDING', NOW())`,
                [customerId, accountType.id, accountNumber]
            );
        }

        return successResponse({
            message: 'Customer record created successfully',
            customerId
        });

    }, { requiredRoles: ['BANKER', 'ADMIN'], hideFailure: true });
});

import { NextRequest } from 'next/server';
import {
    withErrorHandler,
    withAuth,
    createdResponse,
    errorResponse,
    validationErrorResponse,
    AuthenticatedRequest,
} from '@/lib/api-utils';
import { z } from 'zod';
import { createAccount } from '@/lib/services/account-service';
import { queryOne, query } from '@/lib/db';
import { RowDataPacket } from 'mysql2/promise';

// Validation schema for creating an account
const createAccountSchema = z.object({
    customerId: z.number().int().positive(),
    accountTypeCode: z.enum(['SAVINGS', 'CHECKING', 'BUSINESS']).optional().default('SAVINGS'),
});

/**
 * POST /api/v1/banker/accounts
 * Create a new account for an existing customer.
 * Requires BANKER or ADMIN role.
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
    return withAuth(request, async (req: AuthenticatedRequest) => {
        const { user } = req;
        if (!user) {
            return errorResponse('Unauthorized', 401);
        }

        // 1. Validate request body
        const body = await request.json();
        const result = createAccountSchema.safeParse(body);

        if (!result.success) {
            return validationErrorResponse(
                result.error.issues.map((e) => ({
                    field: e.path.join('.'),
                    message: e.message
                }))
            );
        }

        const { customerId, accountTypeCode } = result.data;

        // 2. Lookup account type ID
        const accountType = await queryOne<RowDataPacket>(
            'SELECT id FROM account_types WHERE code = ?',
            [accountTypeCode]
        );

        if (!accountType) {
            return errorResponse('Invalid account type', 400);
        }

        // 3. Create the account using the service
        const createResult = await createAccount(
            customerId,
            accountType.id,
            user.id
        );

        if (!createResult.success) {
            return errorResponse(createResult.error || 'Failed to create account', 400);
        }

        return createdResponse({
            message: 'Account created successfully',
            accountId: createResult.accountId,
            accountNumber: createResult.accountNumber,
        });

    }, { requiredRoles: ['BANKER', 'ADMIN'] });
});

/**
 * GET /api/v1/banker/accounts
 * List all accounts (for administrative purposes).
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
    return withAuth(request, async (req: AuthenticatedRequest) => {
        const { searchParams } = new URL(request.url);
        const customerId = searchParams.get('customerId');

        let whereClause = '';
        const params: any[] = [];

        if (customerId) {
            whereClause = 'WHERE a.customer_id = ?';
            params.push(parseInt(customerId, 10));
        }

        const accounts = await query<RowDataPacket[]>(
            `SELECT a.id, a.account_number, a.customer_id, 
                    at.code as account_type, a.status, a.opened_at,
                    COALESCE(ab.available_balance, 0) as balance,
                    c.first_name, c.last_name, c.customer_number
             FROM accounts a
             JOIN account_types at ON at.id = a.account_type_id
             JOIN customers c ON c.id = a.customer_id
             LEFT JOIN account_balances ab ON ab.account_id = a.id
             ${whereClause}
             ORDER BY a.created_at DESC
             LIMIT 100`,
            params
        );

        return {
            status: 200,
            json: async () => ({ success: true, data: accounts })
        } as any;

    }, { requiredRoles: ['BANKER', 'ADMIN'] });
});

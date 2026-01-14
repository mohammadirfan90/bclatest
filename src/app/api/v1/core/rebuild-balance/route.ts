/**
 * POST /api/v1/core/rebuild-balance - Rebuild account balance from ledger
 * 
 * Version: 1.0.0
 * Access: Admin only
 */

import { NextRequest } from 'next/server';
import {
    withErrorHandler,
    withAuth,
    successResponse,
    errorResponse,
    AuthenticatedRequest,
} from '@/lib/api-utils';
import { rebuildBalance } from '@/lib/services/transaction-service';
import { getAccountById } from '@/lib/services/account-service';

export const POST = withErrorHandler(async (request: NextRequest) => {
    return withAuth(
        request,
        async (req: AuthenticatedRequest) => {
            // 1. Parse request body
            const body = await request.json();
            const { accountId } = body;

            if (!accountId || typeof accountId !== 'number') {
                return errorResponse('accountId is required and must be a number', 400);
            }

            // 2. Verify account exists
            const account = await getAccountById(accountId);
            if (!account) {
                return errorResponse('Account not found', 404);
            }

            // 3. Execute balance rebuild via stored procedure
            const result = await rebuildBalance(accountId);

            // 4. Return result
            if (!result.success) {
                return errorResponse(result.message, 400);
            }

            return successResponse({
                accountId,
                oldBalance: result.oldBalance,
                newBalance: result.newBalance,
                status: result.status,
                message: result.message,
            });
        },
        {
            requiredType: 'user',
            requiredRoles: ['ADMIN'],
        }
    );
});

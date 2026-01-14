/**
 * POST /api/v1/core/withdraw - Withdraw money from an account
 * 
 * Version: 1.0.0
 * Access: Banker only
 */

import { NextRequest } from 'next/server';
import {
    withErrorHandler,
    withAuth,
    validateBody,
    successResponse,
    errorResponse,
    AuthenticatedRequest,
} from '@/lib/api-utils';
import { withdrawSchema } from '@/lib/validations/schemas';
import { withdraw } from '@/lib/services/transaction-service';
import { getAccountById } from '@/lib/services/account-service';

export const POST = withErrorHandler(async (request: NextRequest) => {
    return withAuth(
        request,
        async (req: AuthenticatedRequest) => {
            // 1. Validate request body
            const validation = await validateBody(request, withdrawSchema);
            if (!validation.success) {
                return validation.response;
            }

            const { accountId, amount, description } = validation.data;

            // 2. Verify account exists
            const account = await getAccountById(accountId);
            if (!account) {
                return errorResponse('Account not found', 404);
            }

            // 3. Execute withdrawal via stored procedure
            const result = await withdraw({
                accountId,
                amount,
                description,
                bankerId: req.user!.id,
            });

            // 4. Return result
            if (!result.success) {
                return errorResponse(result.message, 400);
            }

            return successResponse({
                transactionId: result.transactionId,
                status: result.status,
                message: result.message,
            });
        },
        {
            requiredType: 'user',
            requiredRoles: ['BANKER', 'ADMIN'],
        }
    );
});

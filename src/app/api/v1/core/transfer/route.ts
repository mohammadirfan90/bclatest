/**
 * POST /api/v1/transactions/transfer - Transfer money between accounts
 * 
 * Version: 1.0.0
 * Access: Customer (own accounts) or Banker (any accounts)
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
import { transferSchema } from '@/lib/validations/schemas';
import { transfer } from '@/lib/services/transaction-service';
import { getAccountById } from '@/lib/services/account-service';

export const POST = withErrorHandler(async (request: NextRequest) => {
    return withAuth(
        request,
        async (req: AuthenticatedRequest) => {
            // 1. Validate request body
            const validation = await validateBody(request, transferSchema);
            if (!validation.success) {
                return validation.response;
            }

            const { fromAccountId, toAccountId, amount, description } = validation.data;

            // 2. For customers, verify they own the source account
            if (req.tokenPayload?.type === 'customer') {
                const sourceAccount = await getAccountById(fromAccountId);
                if (!sourceAccount || sourceAccount.customerId !== req.customer?.id) {
                    return errorResponse('You can only transfer from your own accounts', 403);
                }
            }

            // 3. Verify destination account exists
            const destAccount = await getAccountById(toAccountId);
            if (!destAccount) {
                return errorResponse('Destination account not found', 404);
            }

            // 4. Execute transfer via stored procedure
            const result = await transfer({
                fromAccountId,
                toAccountId,
                amount,
                description,
                performedBy: req.user?.id || req.customer?.id || 0,
            });

            // 5. Return result
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
            requiredType: 'any', // Both customers and bankers can transfer
        }
    );
});

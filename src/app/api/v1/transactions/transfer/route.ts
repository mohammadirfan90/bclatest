import { NextRequest } from 'next/server';
import {
    withErrorHandler,
    withAuth,
    validateBody,
    successResponse,
    errorResponse,
    checkIdempotency,
    AuthenticatedRequest,
} from '@/lib/api-utils';
import { transferSchema } from '@/lib/validations/schemas';
import { transfer } from '@/lib/services/transaction-service';
import { getAccountById } from '@/lib/services/account-service';

// =============================================================================
// POST /api/v1/transactions/transfer - Transfer money
// =============================================================================

export const POST = withErrorHandler(async (request: NextRequest) => {
    return withAuth(
        request,
        async (req: AuthenticatedRequest) => {
            const validation = await validateBody(request, transferSchema);
            if (!validation.success) {
                return validation.response;
            }

            const { fromAccountId, toAccountId, amount, description, idempotencyKey } = validation.data;

            // Check idempotency
            if (idempotencyKey) {
                const cached = await checkIdempotency(idempotencyKey);
                if (cached.cached) {
                    return cached.response;
                }
            }

            // For customers, verify they own the source account
            if (req.tokenPayload?.type === 'customer') {
                const sourceAccount = await getAccountById(fromAccountId);
                if (!sourceAccount || sourceAccount.customerId !== req.customer?.id) {
                    return errorResponse('Source account not found');
                }
            }

            // Verify destination account exists
            const destAccount = await getAccountById(toAccountId);
            if (!destAccount) {
                return errorResponse('Destination account not found');
            }

            // Execute transfer via stored procedure
            const result = await transfer({
                fromAccountId,
                toAccountId,
                amount,
                description,
                idempotencyKey,
                userId: req.user?.id || req.customer?.id,
            });

            if (!result.success) {
                return errorResponse(result.message, 400);
            }

            return successResponse({
                transactionId: result.transactionReference,
                status: result.status,
                message: result.message,
            });
        },
        {
            requiredType: 'any',
        }
    );
});

import { NextRequest } from 'next/server';
import {
    withErrorHandler,
    withAuth,
    validateBody,
    successResponse,
    errorResponse,
    AuthenticatedRequest,
    getIdempotencyKey,
} from '@/lib/api-utils';
import { depositSchema } from '@/lib/validations/schemas';
import { deposit } from '@/lib/services/transaction-service';
import { getAccountById } from '@/lib/services/account-service';

// =============================================================================
// POST /api/v1/transactions/deposit - Deposit money (Banker only)
// =============================================================================

export const POST = withErrorHandler(async (request: NextRequest) => {
    return withAuth(
        request,
        async (req: AuthenticatedRequest) => {
            // Get idempotency key from header
            const idempotencyKeyFromHeader = getIdempotencyKey(request);

            const validation = await validateBody(request, depositSchema);
            if (!validation.success) {
                return validation.response;
            }

            const { accountId, amount, description, externalReference } = validation.data;

            // Use header key if provided, otherwise use body key, otherwise auto-generate
            const idempotencyKey = idempotencyKeyFromHeader || validation.data.idempotencyKey || crypto.randomUUID();

            // Verify account exists
            const account = await getAccountById(accountId);
            if (!account) {
                return errorResponse('Account not found');
            }

            // Execute deposit via stored procedure with idempotency
            const result = await deposit({
                accountId,
                amount,
                description,
                externalReference,
                userId: req.user!.id,
                idempotencyKey,
            });

            if (!result.success) {
                return errorResponse(result.message, 400);
            }

            return successResponse({
                transactionId: result.transactionId,
                status: result.status,
                message: result.message,
                idempotent: result.message === 'Idempotent replay',
            });
        },
        {
            requiredType: 'user',
            requiredPermissions: ['transactions.write'],
        }
    );
});

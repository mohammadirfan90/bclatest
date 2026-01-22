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
import { getAccountById, getAccountByNumber } from '@/lib/services/account-service';

// =============================================================================
// POST /api/v1/transactions/transfer - Transfer money
// =============================================================================

export const POST = withErrorHandler(async (request: NextRequest) => {
    return withAuth(
        request,
        async (req: AuthenticatedRequest) => {
            try {
                console.log('[Transfer] Starting transfer request...');
                const validation = await validateBody(request, transferSchema);
                if (!validation.success) {
                    console.log('[Transfer] Validation failed:', validation.response);
                    return validation.response;
                }

                const { fromAccountId, toAccountNumber, amount, description, idempotencyKey } = validation.data;
                console.log('[Transfer] Data:', { fromAccountId, toAccountNumber, amount, description, idempotencyKey });

                // Check idempotency
                if (idempotencyKey) {
                    const cached = await checkIdempotency(idempotencyKey);
                    if (cached.cached) {
                        return cached.response;
                    }
                }

                // Look up destination account by account number
                const destAccount = await getAccountByNumber(toAccountNumber);
                if (!destAccount) {
                    console.log('[Transfer] Destination account not found');
                    return errorResponse('Destination account not found');
                }

                // Prevent self-transfer
                if (fromAccountId === destAccount.id) {
                    return errorResponse('Cannot transfer to the same account');
                }

                // For customers, verify they own the source account
                if (req.tokenPayload?.type === 'customer') {
                    const sourceAccount = await getAccountById(fromAccountId);
                    if (!sourceAccount || sourceAccount.customerId !== req.customer?.id) {
                         console.log('[Transfer] Source account mismatch:', { sourceAccount, customerId: req.customer?.id });
                        return errorResponse('Source account not found');
                    }
                }

                const performedBy = (req.user?.id || req.customer?.id) as number;
                console.log('[Transfer] Performed By:', performedBy);

                // Execute transfer via stored procedure
                const result = await transfer({
                    fromAccountId,
                    toAccountId: destAccount.id,
                    amount,
                    description,
                    idempotencyKey,
                    performedBy,
                });

                if (!result.success) {
                    console.log('[Transfer] Procedure failed:', result.message);
                    return errorResponse(result.message, 400);
                }

                return successResponse({
                    transactionId: result.transactionId,
                    status: result.status,
                    message: result.message,
                });
            } catch (err: any) {
                console.error('[Transfer] CRITICAL ERROR:', err);
                return errorResponse(`CRITICAL TRANSFER ERROR: ${err.message}`, 500);
            }
        },
        {
            requiredType: 'any',
        }
    );
});

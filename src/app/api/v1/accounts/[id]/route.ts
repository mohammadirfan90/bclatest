import { NextRequest } from 'next/server';
import {
    withErrorHandler,
    withAuth,
    validateBody,
    validateQuery,
    successResponse,
    notFoundResponse,
    errorResponse,
    forbiddenResponse,
    getPaginationMeta,
    getOffset,
    AuthenticatedRequest,
} from '@/lib/api-utils';
import { updateAccountStatusSchema, paginationSchema } from '@/lib/validations/schemas';
import {
    getAccountById,
    // updateAccountStatus, // Deprecated
    refreshAccountBalance,
} from '@/lib/services/account-service';
import { getLedgerEntriesForAccount } from '@/lib/services/transaction-service';

// =============================================================================
// GET /api/v1/accounts/[id] - Get account details
// =============================================================================

export const GET = withErrorHandler(async (request: NextRequest, context) => {
    const params = await context?.params;
    const accountId = parseInt(params?.id || '0');

    return withAuth(
        request,
        async (req: AuthenticatedRequest) => {
            const account = await getAccountById(accountId);
            if (!account) {
                return notFoundResponse('Account not found');
            }

            // Customers can only view their own accounts
            if (req.tokenPayload?.type === 'customer') {
                if (account.customerId !== req.customer?.id) {
                    return notFoundResponse('Account not found');
                }
            }

            return successResponse(account);
        },
        {
            requiredType: 'any',
        }
    );
});

// =============================================================================
// PATCH /api/v1/accounts/[id] - Update account status
// =============================================================================

export const PATCH = withErrorHandler(async (request: NextRequest, context) => {
    const params = await context?.params;
    const accountId = parseInt(params?.id || '0');

    return withAuth(
        request,
        async (req: AuthenticatedRequest) => {
            const validation = await validateBody(request, updateAccountStatusSchema);
            if (!validation.success) {
                return validation.response;
            }

            const { status, reason } = validation.data;
            const bankerId = req.user!.id; // Only bankers can update status via this/these endpoints

            let result;

            // Map status changes to specific functions
            if (status === 'SUSPENDED') {
                const { freezeAccount } = await import('@/lib/services/account-service');
                result = await freezeAccount(accountId, bankerId, reason || 'Admin Action');
            } else if (status === 'ACTIVE') {
                // Check if it's currently suspended? 
                // We don't have 'unfreeze' explicit status, but transition to ACTIVE implies unfreeze if SUSPENDED.
                const { unfreezeAccount } = await import('@/lib/services/account-service');
                result = await unfreezeAccount(accountId, bankerId, reason || 'Admin Action');
            } else if (status === 'CLOSED') {
                const { closeAccount } = await import('@/lib/services/account-service');
                result = await closeAccount(accountId, bankerId, reason || 'Admin Action');
            } else {
                return errorResponse(`Invalid status transition to ${status}`);
            }

            if (!result.success) {
                return errorResponse(result.error || 'Failed to update account');
            }

            const { getAccountById } = await import('@/lib/services/account-service');
            const updated = await getAccountById(accountId);
            return successResponse(updated);
        },
        {
            requiredType: 'user',
            requiredPermissions: ['accounts.write'],
        }
    );
});

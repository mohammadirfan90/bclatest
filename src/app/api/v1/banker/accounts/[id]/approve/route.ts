import { NextRequest } from 'next/server';
import { approveAccount } from '@/lib/services/account-service';
import { withAuth, AuthenticatedRequest, errorResponse, successResponse, withErrorHandler } from '@/lib/api-utils';

export const POST = withErrorHandler<{ id: string }>(async (request: NextRequest, context) => {
    const params = await context?.params;

    return withAuth(request, async (authReq: AuthenticatedRequest) => {
        const applicationId = parseInt(params?.id || '0');
        if (isNaN(applicationId) || applicationId === 0) return errorResponse('Invalid ID');

        // Banker ID from auth user
        const bankerId = authReq.user!.id;

        const result = await approveAccount(applicationId, bankerId);

        if (!result.success) {
            return errorResponse(result.error || 'Approval failed');
        }

        return successResponse({
            message: 'Account approved',
            accountId: result.accountId,
            accountNumber: result.accountNumber
        });
    }, {
        requiredType: 'user'
    });
});

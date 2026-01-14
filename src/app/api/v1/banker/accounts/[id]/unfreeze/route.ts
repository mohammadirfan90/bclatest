import { NextRequest } from 'next/server';
import { unfreezeAccount } from '@/lib/services/account-service';
import { withAuth, AuthenticatedRequest, validateBody, errorResponse, successResponse, withErrorHandler } from '@/lib/api-utils';
import { z } from 'zod';

const unfreezeSchema = z.object({
    reason: z.string().min(1, 'Reason is required'),
});

export const POST = withErrorHandler<{ id: string }>(async (request: NextRequest, context) => {
    const params = await context?.params;

    return withAuth(request, async (authReq: AuthenticatedRequest) => {
        const accountId = parseInt(params?.id || '0');
        if (isNaN(accountId) || accountId === 0) return errorResponse('Invalid ID');

        const validation = await validateBody(request, unfreezeSchema);
        if (!validation.success) return validation.response;

        const result = await unfreezeAccount(accountId, authReq.user!.id, validation.data.reason);

        if (!result.success) return errorResponse(result.error || 'Failed');

        return successResponse({ message: 'Account unfrozen' });
    }, { requiredType: 'user' });
});

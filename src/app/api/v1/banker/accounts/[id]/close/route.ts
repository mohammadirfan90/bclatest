import { NextRequest } from 'next/server';
import { closeAccount } from '@/lib/services/account-service';
import { withAuth, AuthenticatedRequest, validateBody, errorResponse, successResponse, withErrorHandler } from '@/lib/api-utils';
import { z } from 'zod';

const closeSchema = z.object({
    reason: z.string().min(1, 'Reason is required'),
});

export const POST = withErrorHandler<{ id: string }>(async (request: NextRequest, context) => {
    const params = await context?.params;

    return withAuth(request, async (authReq: AuthenticatedRequest) => {
        const accountId = parseInt(params?.id || '0');
        if (isNaN(accountId) || accountId === 0) return errorResponse('Invalid ID');

        const validation = await validateBody(request, closeSchema);
        if (!validation.success) return validation.response;

        const result = await closeAccount(accountId, authReq.user!.id, validation.data.reason);

        if (!result.success) return errorResponse(result.error || 'Failed');

        return successResponse({ message: 'Account closed successfully' });
    }, { requiredType: 'user' });
});

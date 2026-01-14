import { NextRequest } from 'next/server';
import { rejectAccount } from '@/lib/services/account-service';
import { withAuth, AuthenticatedRequest, validateBody, errorResponse, successResponse, withErrorHandler } from '@/lib/api-utils';
import { z } from 'zod';

const rejectSchema = z.object({
    reason: z.string().min(1, 'Reason is required'),
});

export const POST = withErrorHandler<{ id: string }>(async (request: NextRequest, context) => {
    const params = await context?.params;

    return withAuth(request, async (authReq: AuthenticatedRequest) => {
        const applicationId = parseInt(params?.id || '0');
        if (isNaN(applicationId) || applicationId === 0) return errorResponse('Invalid ID');

        const validation = await validateBody(request, rejectSchema);
        if (!validation.success) return validation.response;

        const result = await rejectAccount(applicationId, authReq.user!.id, validation.data.reason);

        if (!result.success) return errorResponse(result.error || 'Failed');

        return successResponse({ message: 'Application rejected' });
    }, { requiredType: 'user' });
});

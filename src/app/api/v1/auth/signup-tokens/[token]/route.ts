import { NextRequest } from 'next/server';
import {
    withErrorHandler,
    successResponse,
    errorResponse,
} from '@/lib/api-utils';
import { verifySignupToken } from '@/lib/services/auth-service';

export const GET = withErrorHandler<{ token: string }>(async (request: NextRequest, context) => {
    const params = await context?.params;
    const token = params?.token;

    if (!token) {
        return errorResponse('Token is required', 400);
    }

    const result = await verifySignupToken(token);

    if (!result.success) {
        return errorResponse(result.error || 'Invalid token', 400);
    }

    return successResponse({
        valid: true,
        ...result.data
    });
});

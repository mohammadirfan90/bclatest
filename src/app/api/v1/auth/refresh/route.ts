import { NextRequest } from 'next/server';
import {
    withErrorHandler,
    validateBody,
    successResponse,
    errorResponse,
} from '@/lib/api-utils';
import { refreshTokenSchema } from '@/lib/validations/schemas';
import { refreshAccessToken } from '@/lib/services/auth-service';

// =============================================================================
// POST /api/v1/auth/refresh
// =============================================================================

export const POST = withErrorHandler(async (request: NextRequest) => {
    const validation = await validateBody(request, refreshTokenSchema);
    if (!validation.success) {
        return validation.response;
    }

    const { refreshToken } = validation.data;
    const result = await refreshAccessToken(refreshToken);

    if (!result.success) {
        return errorResponse(result.error || 'Token refresh failed', 401);
    }

    return successResponse({
        token: result.token,
    });
});

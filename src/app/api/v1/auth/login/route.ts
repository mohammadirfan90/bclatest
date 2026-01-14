import { NextRequest } from 'next/server';
import {
    withErrorHandler,
    withAuth,
    validateBody,
    successResponse,
    errorResponse,
    AuthenticatedRequest,
} from '@/lib/api-utils';
import { loginSchema, refreshTokenSchema } from '@/lib/validations/schemas';
import {
    authenticateUser,
    authenticateCustomer,
    refreshAccessToken,
} from '@/lib/services/auth-service';

// =============================================================================
// POST /api/v1/auth/login
// =============================================================================

export const POST = withErrorHandler(async (request: NextRequest) => {
    const validation = await validateBody(request, loginSchema);
    if (!validation.success) {
        return validation.response;
    }

    const { email, password, type } = validation.data;
    console.log(`[Login Attempt] Email: ${email}, Type: ${type}`);

    let result;
    if (type === 'customer') {
        result = await authenticateCustomer(email, password);
    } else {
        result = await authenticateUser(email, password);
    }

    if (!result.success) {
        console.log(`[Login Failed] Error: ${result.error}`);
        return errorResponse(result.error || 'Authentication failed', 401);
    }
    console.log(`[Login Success] User: ${email}`);

    return successResponse({
        user: result.user,
        token: result.token,
        refreshToken: result.refreshToken,
    });
});

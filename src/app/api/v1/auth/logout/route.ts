
import { NextRequest } from 'next/server';
import {
    withErrorHandler,
    withAuth,
    successResponse,
    AuthenticatedRequest,
    errorResponse,
} from '@/lib/api-utils';
import { logout } from '@/lib/services/auth-service';

// =============================================================================
// POST /api/v1/auth/logout
// =============================================================================

export const POST = withErrorHandler(async (request: NextRequest) => {
    return withAuth(request, async (req: AuthenticatedRequest) => {
        const { user, customer } = req;

        if (user) {
            await logout(user.id, 'user');
        } else if (customer) {
            await logout(customer.id, 'customer');
        } else {
            return errorResponse('Invalid session', 401);
        }

        return successResponse({ message: 'Logged out successfully' });
    });
});

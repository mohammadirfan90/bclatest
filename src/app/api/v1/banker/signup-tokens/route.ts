
import { NextRequest } from 'next/server';
import {
    withErrorHandler,
    withAuth,
    successResponse,
    errorResponse,
    AuthenticatedRequest,
    validationErrorResponse,
} from '@/lib/api-utils';
import { generateSignupToken } from '@/lib/services/auth-service';
import { z } from 'zod';

const generateTokenSchema = z.object({
    customerId: z.number(),
    accountId: z.number(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
    return withAuth(request, async (req: AuthenticatedRequest) => {
        // 1. Verify Banker Role
        const { user } = req;
        if (!user || (user.roleCode !== 'BANKER' && user.roleCode !== 'ADMIN')) {
            return errorResponse('Unauthorized: Only bankers can generate signup links', 403);
        }

        // 2. Parse Body
        const body = await request.json();
        const result = generateTokenSchema.safeParse(body);

        if (!result.success) {
            return validationErrorResponse(result.error.issues.map(e => ({ field: e.path.join('.'), message: e.message })));
        }

        const { customerId, accountId } = result.data;

        // 3. Generate Token
        // Ensure user.id is safe to access (it is, because of withAuth, but TS might complain if user is optional)
        if (!user.id) return errorResponse('User ID missing', 500);

        const tokenResult = await generateSignupToken(customerId, accountId, user.id);

        if (!tokenResult.success || !tokenResult.token) {
            return errorResponse(tokenResult.error || 'Failed to generate token', 500);
        }

        // 4. Construct Link
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
        const link = `${baseUrl}/signup/${tokenResult.token}`;

        return successResponse({
            message: 'Signup link generated successfully',
            link,
            token: tokenResult.token,
            expiresIn: '48h'
        });
    }, { requiredRoles: ['BANKER', 'ADMIN'], hideFailure: true });
});

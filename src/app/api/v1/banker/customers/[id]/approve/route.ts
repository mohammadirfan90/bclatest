import { NextRequest } from 'next/server';
import {
    withErrorHandler,
    withAuth,
    successResponse,
    errorResponse,
    AuthenticatedRequest,
} from '@/lib/api-utils';
import { execute, queryOne } from '@/lib/db';
import { RowDataPacket } from 'mysql2/promise';

export const POST = withErrorHandler<{ id: string }>(async (request: NextRequest, context) => {
    const params = await context?.params;

    return withAuth(request, async (req: AuthenticatedRequest) => {
        // 1. Verify Role
        const { user } = req;
        if (!user || (user.roleCode !== 'BANKER' && user.roleCode !== 'ADMIN')) {
            return errorResponse('Unauthorized', 403);
        }

        const id = params?.id;

        // 2. Check Customer Status
        const customer = await queryOne<RowDataPacket & { onboarding_status: string }>(
            'SELECT id, onboarding_status FROM customers WHERE id = ?',
            [id]
        );

        if (!customer) {
            return errorResponse('Customer not found', 404);
        }

        if (customer.onboarding_status === 'ACTIVE') {
            return errorResponse('Customer is already active', 400);
        }

        if (customer.onboarding_status === 'PENDING_SIGNUP') {
            return errorResponse('Customer has not completed signup yet', 400);
        }

        // 3. Approve
        await execute(
            `UPDATE customers 
             SET onboarding_status = 'ACTIVE', 
                 status = 'ACTIVE',
                 updated_at = NOW() 
             WHERE id = ?`,
            [id]
        );

        return successResponse({ message: 'Customer approved successfully' });
    }, { requiredRoles: ['BANKER', 'ADMIN'], hideFailure: true });
});

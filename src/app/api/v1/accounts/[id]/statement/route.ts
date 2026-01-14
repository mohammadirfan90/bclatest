import { NextRequest, NextResponse } from 'next/server';
import {
    withErrorHandler,
    withAuth,
    successResponse,
    notFoundResponse,
    errorResponse,
    getPaginationMeta,
    AuthenticatedRequest,
} from '@/lib/api-utils';
import { getAccountStatement } from '@/lib/services/statement-service';
import { getAccountById } from '@/lib/services/account-service';

// =============================================================================
// GET /api/v1/accounts/[id]/statement - Get account statement
// =============================================================================

export const GET = withErrorHandler(async (request: NextRequest, context) => {
    const params = await context?.params;
    const accountId = parseInt(params?.id || '0');

    return withAuth(
        request,
        async (req: AuthenticatedRequest) => {
            // Validate account exists
            const account = await getAccountById(accountId);
            if (!account) {
                return notFoundResponse('Account not found');
            }

            // Customers can only view their own accounts
            if (req.tokenPayload?.type === 'customer') {
                if (account.customerId !== req.customer?.id) {
                    return notFoundResponse('Account not found');
                }
            }

            // Get query parameters
            const { searchParams } = new URL(request.url);
            const from = searchParams.get('from');
            const to = searchParams.get('to');
            const page = parseInt(searchParams.get('page') || '1');
            const size = parseInt(searchParams.get('size') || '50');

            // Validate required parameters
            if (!from || !to) {
                return errorResponse('Missing required parameters: from and to dates are required');
            }

            // Validate date format
            const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
            if (!dateRegex.test(from) || !dateRegex.test(to)) {
                return errorResponse('Invalid date format. Use YYYY-MM-DD');
            }

            // Validate date range
            if (new Date(from) > new Date(to)) {
                return errorResponse('Invalid date range: from date must be before to date');
            }

            try {
                const { statement, total } = await getAccountStatement(accountId, {
                    from,
                    to,
                    page,
                    size,
                });

                return successResponse(statement, getPaginationMeta(page, size, total));
            } catch (error) {
                console.error('Statement generation error:', error);
                return errorResponse('Failed to generate statement');
            }
        },
        {
            requiredType: 'any',
        }
    );
});

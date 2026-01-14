/**
 * GET /api/v1/core/audit - Get audit trail
 * 
 * Version: 1.0.0
 * Access: Auditor, Admin only
 */

import { NextRequest } from 'next/server';
import {
    withErrorHandler,
    withAuth,
    successResponse,
    AuthenticatedRequest,
} from '@/lib/api-utils';
import { getAuditTrail } from '@/lib/services/transaction-service';

export const GET = withErrorHandler(async (request: NextRequest) => {
    return withAuth(
        request,
        async (_req: AuthenticatedRequest) => {
            // Parse query parameters
            const searchParams = request.nextUrl.searchParams;
            const limit = parseInt(searchParams.get('limit') || '50');
            const offset = parseInt(searchParams.get('offset') || '0');
            const accountId = searchParams.get('accountId');
            const startDate = searchParams.get('startDate');
            const endDate = searchParams.get('endDate');

            // Fetch audit trail
            const result = await getAuditTrail({
                limit: Math.min(limit, 100), // Cap at 100
                offset,
                accountId: accountId ? parseInt(accountId) : undefined,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
            });

            return successResponse({
                entries: result.entries,
                total: result.total,
                limit,
                offset,
            });
        },
        {
            requiredType: 'user',
            requiredRoles: ['AUDITOR', 'ADMIN'],
        }
    );
});

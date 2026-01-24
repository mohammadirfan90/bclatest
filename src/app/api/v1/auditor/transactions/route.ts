/**
 * GET /api/v1/auditor/transactions - Get all transactions (read-only)
 * 
 * Access: Auditor, Admin only
 */

import { NextRequest } from 'next/server';
import {
    withErrorHandler,
    withAuth,
    successResponse,
    AuthenticatedRequest,
} from '@/lib/api-utils';
import { searchTransactions } from '@/lib/services/transaction-service';

export const GET = withErrorHandler(async (request: NextRequest) => {
    return withAuth(
        request,
        async (_req: AuthenticatedRequest) => {
            const searchParams = request.nextUrl.searchParams;
            const limit = parseInt(searchParams.get('limit') || '50');
            const offset = parseInt(searchParams.get('offset') || '0');
            const accountNumber = searchParams.get('accountNumber');
            const transactionReference = searchParams.get('reference');
            const startDate = searchParams.get('startDate');
            const endDate = searchParams.get('endDate');
            const status = searchParams.get('status');
            const type = searchParams.get('type');

            const result = await searchTransactions({
                limit: Math.min(limit, 100),
                offset,
                accountNumber: accountNumber || undefined,
                transactionReference: transactionReference || undefined,
                startDate: startDate || undefined,
                endDate: endDate || undefined,
                status: status || undefined,
                type: type || undefined,
            });

            return successResponse({
                transactions: result.transactions,
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

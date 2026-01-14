/**
 * GET /api/v1/core/ledger - Get ledger entries
 * 
 * Version: 1.0.0
 * Access: Banker, Auditor, Admin
 */

import { NextRequest } from 'next/server';
import {
    withErrorHandler,
    withAuth,
    successResponse,
    AuthenticatedRequest,
} from '@/lib/api-utils';
import { getAllLedgerEntries } from '@/lib/services/transaction-service';

export const GET = withErrorHandler(async (request: NextRequest) => {
    return withAuth(
        request,
        async (_req: AuthenticatedRequest) => {
            // Parse query parameters
            const searchParams = request.nextUrl.searchParams;
            const limit = parseInt(searchParams.get('limit') || '50');
            const offset = parseInt(searchParams.get('offset') || '0');
            const accountId = searchParams.get('accountId');
            const entryType = searchParams.get('entryType') as 'DEBIT' | 'CREDIT' | null;
            const startDate = searchParams.get('startDate');
            const endDate = searchParams.get('endDate');

            // Fetch ledger entries
            const result = await getAllLedgerEntries({
                limit: Math.min(limit, 100), // Cap at 100
                offset,
                accountId: accountId ? parseInt(accountId) : undefined,
                entryType: entryType || undefined,
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
            requiredRoles: ['BANKER', 'AUDITOR', 'ADMIN'],
        }
    );
});

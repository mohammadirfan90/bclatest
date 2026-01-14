import { NextRequest, NextResponse } from 'next/server';
import {
    withErrorHandler,
    withAuth,
    successResponse,
    getPaginationMeta,
    AuthenticatedRequest,
} from '@/lib/api-utils';
import { searchTransactions, generateCsvFromResults } from '@/lib/services/statement-service';

// =============================================================================
// GET /api/v1/transactions/search - Advanced transaction search (Banker/Admin)
// =============================================================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    return withAuth(
        request,
        async (req: AuthenticatedRequest) => {
            const { searchParams } = new URL(request.url);

            // Parse all filter parameters
            const filters = {
                from: searchParams.get('from') || undefined,
                to: searchParams.get('to') || undefined,
                amountMin: searchParams.get('amountMin')
                    ? parseFloat(searchParams.get('amountMin')!)
                    : undefined,
                amountMax: searchParams.get('amountMax')
                    ? parseFloat(searchParams.get('amountMax')!)
                    : undefined,
                entryType: searchParams.get('entryType') as 'DEBIT' | 'CREDIT' | undefined,
                transactionType: searchParams.get('transactionType') || undefined,
                reference: searchParams.get('reference') || undefined,
                accountId: searchParams.get('accountId')
                    ? parseInt(searchParams.get('accountId')!)
                    : undefined,
                includeReversals: searchParams.get('includeReversals') !== 'false',
                page: parseInt(searchParams.get('page') || '1'),
                size: Math.min(parseInt(searchParams.get('size') || '50'), 100), // Cap at 100
            };

            // Check if CSV export is requested
            const exportCsv = searchParams.get('export') === 'csv';

            if (exportCsv) {
                // Get all results for CSV (up to 10000)
                const { results } = await searchTransactions({
                    ...filters,
                    page: 1,
                    size: 10000,
                });

                const csvContent = generateCsvFromResults(results);

                return new NextResponse(csvContent, {
                    status: 200,
                    headers: {
                        'Content-Type': 'text/csv',
                        'Content-Disposition': `attachment; filename="transactions_${new Date().toISOString().split('T')[0]}.csv"`,
                    },
                });
            }

            const { results, total } = await searchTransactions(filters);

            return successResponse(results, getPaginationMeta(filters.page, filters.size, total));
        },
        {
            requiredRoles: ['BANKER', 'ADMIN'],
        }
    );
});

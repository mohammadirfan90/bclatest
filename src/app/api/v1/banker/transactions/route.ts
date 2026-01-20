
import { NextRequest } from 'next/server';
import { withAuth, AuthenticatedRequest } from '@/lib/api-utils';
import { withErrorHandler, successResponse, getPaginationMeta } from '@/lib/api-utils';
import { searchTransactions } from '@/lib/services/transaction-service';

export const GET = withErrorHandler(async (request: NextRequest) => {
    return withAuth(request, async (req: AuthenticatedRequest) => {
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = (page - 1) * limit;

        const accountId = searchParams.get('accountId');
        const accountNumber = searchParams.get('accountNumber');
        const transactionReference = searchParams.get('transactionReference') || searchParams.get('reference');
        const entryType = searchParams.get('entryType') as 'DEBIT' | 'CREDIT' | undefined;
        const type = searchParams.get('type') || searchParams.get('transactionType');
        const status = searchParams.get('status');
        const startDate = searchParams.get('startDate') || searchParams.get('from');
        const endDate = searchParams.get('endDate') || searchParams.get('to');

        const { transactions, total } = await searchTransactions({
            limit,
            offset,
            accountId: accountId ? parseInt(accountId) : undefined,
            accountNumber: accountNumber || undefined,
            transactionReference: transactionReference || undefined,
            entryType,
            type: type || undefined,
            status: status || undefined,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
        });

        // Return in { results, total } format as expected by the frontend SearchPage
        return successResponse({
            results: transactions,
            total
        }, getPaginationMeta(page, limit, total));
    }, { requiredRoles: ['BANKER', 'ADMIN'], hideFailure: true });
});

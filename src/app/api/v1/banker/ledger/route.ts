
import { NextRequest } from 'next/server';
import { withAuth, AuthenticatedRequest, withErrorHandler, successResponse, getPaginationMeta } from '@/lib/api-utils';
import { getAllLedgerEntries } from '@/lib/services/transaction-service';

export const GET = withErrorHandler(async (request: NextRequest) => {
    return withAuth(request, async (req: AuthenticatedRequest) => {
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = (page - 1) * limit;

        const options = {
            accountId: searchParams.get('accountId') ? parseInt(searchParams.get('accountId')!) : undefined,
            entryType: searchParams.get('entryType') as 'DEBIT' | 'CREDIT' | undefined,
            startDate: searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined,
            endDate: searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined,
            limit,
            offset,
        };

        const { entries, total } = await getAllLedgerEntries(options);

        // Map entries to match expected response format if needed, but getAllLedgerEntries returns enriched rows which is good.
        return successResponse(entries, getPaginationMeta(page, limit, total));
    }, { requiredRoles: ['BANKER', 'ADMIN'] });
});

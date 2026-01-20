import { NextRequest } from 'next/server';
import {
    withErrorHandler,
    withAuth,
    successResponse,
    notFoundResponse,
    AuthenticatedRequest,
} from '@/lib/api-utils';
import { getCustomerById } from '@/lib/services/customer-service';
import { getAccountsForCustomer } from '@/lib/services/account-service';

/**
 * GET /api/v1/banker/customers/[id]
 * Get customer details for banker view
 */
export const GET = withErrorHandler(async (request: NextRequest, context) => {
    const params = await context?.params;
    const customerId = parseInt(params?.id || '0');

    return withAuth(
        request,
        async (req: AuthenticatedRequest) => {
            const customer = await getCustomerById(customerId);
            if (!customer) {
                return notFoundResponse('Customer not found');
            }

            // Get accounts with balances
            const accounts = await getAccountsForCustomer(customerId);

            return successResponse({
                ...customer,
                accounts,
            });
        },
        {
            requiredRoles: ['BANKER', 'ADMIN'],
        }
    );
});

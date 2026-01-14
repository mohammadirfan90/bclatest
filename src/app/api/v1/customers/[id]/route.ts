import { NextRequest } from 'next/server';
import {
    withErrorHandler,
    withAuth,
    validateBody,
    successResponse,
    notFoundResponse,
    errorResponse,
    AuthenticatedRequest,
} from '@/lib/api-utils';
import {
    updateCustomerSchema,
    updateCustomerStatusSchema,
    updateKycStatusSchema,
} from '@/lib/validations/schemas';
import {
    getCustomerById,
    updateCustomer,
    updateCustomerStatus,
    updateKycStatus,
} from '@/lib/services/customer-service';
import { getAccountsForCustomer } from '@/lib/services/account-service';

// =============================================================================
// GET /api/v1/customers/[id] - Get customer details
// =============================================================================

export const GET = withErrorHandler(async (request: NextRequest, context) => {
    const params = await context?.params;
    const customerId = parseInt(params?.id || '0');

    return withAuth(
        request,
        async (req: AuthenticatedRequest) => {
            // Customers can only view their own profile
            if (req.tokenPayload?.type === 'customer') {
                if (req.customer?.id !== customerId) {
                    return notFoundResponse('Customer not found');
                }
            }

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
            requiredType: 'any',
        }
    );
});

// =============================================================================
// PATCH /api/v1/customers/[id] - Update customer
// =============================================================================

export const PATCH = withErrorHandler(async (request: NextRequest, context) => {
    const params = await context?.params;
    const customerId = parseInt(params?.id || '0');

    return withAuth(
        request,
        async (req: AuthenticatedRequest) => {
            const validation = await validateBody(request, updateCustomerSchema);
            if (!validation.success) {
                return validation.response;
            }

            const customer = await getCustomerById(customerId);
            if (!customer) {
                return notFoundResponse('Customer not found');
            }

            const result = await updateCustomer(customerId, validation.data);
            if (!result.success) {
                return errorResponse(result.error || 'Failed to update customer');
            }

            const updated = await getCustomerById(customerId);
            return successResponse(updated);
        },
        {
            requiredType: 'user',
            requiredPermissions: ['customers.write'],
        }
    );
});

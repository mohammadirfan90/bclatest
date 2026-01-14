import { NextRequest } from 'next/server';
import {
    withErrorHandler,
    withAuth,
    validateBody,
    validateQuery,
    successResponse,
    createdResponse,
    errorResponse,
    getPaginationMeta,
    getOffset,
    AuthenticatedRequest,
} from '@/lib/api-utils';
import {
    createCustomerSchema,
    customerSearchSchema,
} from '@/lib/validations/schemas';
import {
    searchCustomers,
    createCustomer,
} from '@/lib/services/customer-service';

// =============================================================================
// GET /api/v1/customers - List customers (Banker/Admin)
// =============================================================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    return withAuth(
        request,
        async (req: AuthenticatedRequest) => {
            const validation = validateQuery(request, customerSearchSchema);
            if (!validation.success) {
                return validation.response;
            }

            const { search, status, kycStatus, page, limit } = validation.data;
            const offset = getOffset(page, limit);

            const { customers, total } = await searchCustomers({
                search,
                status,
                kycStatus,
                limit,
                offset,
            });

            return successResponse(customers, getPaginationMeta(page, limit, total));
        },
        {
            requiredType: 'user',
            requiredPermissions: ['customers.read'],
        }
    );
});

// =============================================================================
// POST /api/v1/customers - Create customer (Banker)
// =============================================================================

export const POST = withErrorHandler(async (request: NextRequest) => {
    return withAuth(
        request,
        async (req: AuthenticatedRequest) => {
            const validation = await validateBody(request, createCustomerSchema);
            if (!validation.success) {
                return validation.response;
            }

            const result = await createCustomer({
                ...validation.data,
                createdBy: req.user!.id,
            });

            if (!result.success) {
                return errorResponse(result.error || 'Failed to create customer');
            }

            return createdResponse({
                customerId: result.customerId,
                customerNumber: result.customerNumber,
            });
        },
        {
            requiredType: 'user',
            requiredPermissions: ['customers.write'],
        }
    );
});

import { NextRequest } from 'next/server';
import {
    withErrorHandler,
    withAuth,
    successResponse,
    createdResponse,
    errorResponse,
    validationErrorResponse,
    AuthenticatedRequest,
    getPaginationMeta,
    getOffset,
    validateQuery,
} from '@/lib/api-utils';
import { query } from '@/lib/db';
import { customerSearchSchema } from '@/lib/validations/schemas';
import { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { createCustomer } from '@/lib/services/auth-service';


export const GET = withErrorHandler(async (request: NextRequest) => {
    return withAuth(request, async (req: AuthenticatedRequest) => {
        // 1. Validate Query Params
        const validation = validateQuery(request, customerSearchSchema);
        if (!validation.success) return validation.response;

        const { search, status, kycStatus, page, limit } = validation.data;
        const offset = getOffset(page, limit);

        // 2. Build Query
        const params: any[] = [];
        let whereClause = 'WHERE 1=1';

        if (search) {
            whereClause += ' AND (c.email LIKE ? OR c.customer_number LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ?)';
            const searchParam = `%${search}%`;
            params.push(searchParam, searchParam, searchParam, searchParam);
        }

        if (status) {
            whereClause += ' AND c.status = ?';
            params.push(status);
        }

        if (kycStatus) {
            whereClause += ' AND c.kyc_status = ?';
            params.push(kycStatus);
        }

        // 3. Execute Count Query
        const [countResult] = await query<RowDataPacket[]>(
            `SELECT COUNT(*) as total FROM customers c ${whereClause}`,
            params
        );
        const total = countResult[0]?.total || 0;

        // 4. Execute Data Query
        const rows = await query<RowDataPacket[]>(
            `SELECT c.id, c.customer_number, c.email, c.first_name, c.last_name, 
                    c.status, c.kyc_status, c.onboarding_status, c.created_at,
                    (SELECT id FROM accounts WHERE customer_id = c.id LIMIT 1) as primary_account_id
             FROM customers c
             ${whereClause}
             ORDER BY c.created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        return successResponse(rows, getPaginationMeta(page, limit, total));
    }, { requiredRoles: ['BANKER', 'ADMIN'], hideFailure: true });
});

const createCustomerSchema = z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    phone: z.string().optional(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
    return withAuth(request, async (req: AuthenticatedRequest) => {
        // 1. Verify Role
        const { user } = req;
        if (!user || user.roleCode !== 'BANKER') {
            return errorResponse('Unauthorized', 403);
        }

        // 2. Validate Body
        const body = await request.json();
        const result = createCustomerSchema.safeParse(body);
        if (!result.success) {
            return validationErrorResponse(result.error.issues.map(e => ({ field: e.path.join('.'), message: e.message })));
        }


        const { firstName, lastName, email, phone } = result.data;

        // 3. Create Customer (Service)
        // Auto-generate temp password
        const tempPassword = Math.random().toString(36).slice(-10) + 'X!1';

        const createResult = await createCustomer(email, tempPassword, firstName, lastName, user.id);

        if (!createResult.success || !createResult.customerId) {
            return errorResponse(createResult.error || 'Failed to create customer', 400);
        }

        // 4. Simplified Response (No Onboarding Token)
        // In this minimal version, we return the temp password to the banker to share with the customer manually.

        return createdResponse({
            customerId: createResult.customerId,
            customerNumber: createResult.customerNumber,
            message: 'Customer created successfully.',
            tempPassword: tempPassword, // Exposed for demo purposes since we don't have email service
            note: 'Please share these credentials with the customer securely.'
        });

    }, { requiredRoles: ['BANKER'] });
});



import { NextRequest } from 'next/server';
import {
    withErrorHandler,
    withAuth,
    successResponse,
    AuthenticatedRequest,
    errorResponse
} from '@/lib/api-utils';
import { query } from '@/lib/db';
import { RowDataPacket } from 'mysql2/promise';

export const GET = withErrorHandler(async (request: NextRequest) => {
    return withAuth(request, async (req: AuthenticatedRequest) => {
        // Only for type 'customer'
        const { customer } = req;
        if (!customer) return errorResponse('Unauthorized', 401);

        // Fetch full details
        const [rows] = await query<RowDataPacket[]>(
            `SELECT first_name, last_name, email, phone, 
                    national_id, date_of_birth, address_line1, address_line2, 
                    city, postal_code, kyc_status, status
             FROM customers 
             WHERE id = ?`,
            [customer.id]
        );

        if (!rows.length) return errorResponse('Customer not found', 404);
        const profile = rows[0];

        return successResponse({
            profile,
            pendingRequest: null // No online KYC requests in simplified version
        });

    }, { requiredType: 'customer' });
});

export const PUT = withErrorHandler(async (request: NextRequest) => {
    return withAuth(request, async (req: AuthenticatedRequest) => {
        // In the simplifed version, we do not allow online profile updates to avoid complexity 
        // of audit trails and approvals without the extended schema.
        return errorResponse('Online profile updates are currently disabled. Please visit a branch to update your information.', 403);
    }, { requiredType: 'customer' });
});

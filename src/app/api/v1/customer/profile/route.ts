
import { NextRequest } from 'next/server';
import {
    withErrorHandler,
    withAuth,
    successResponse,
    AuthenticatedRequest,
    errorResponse,
    validateBody
} from '@/lib/api-utils';
import { query, execute } from '@/lib/db';
import { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';

// Validation schema for profile updates
const updateProfileSchema = z.object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    phone: z.string().max(20).optional(),
    nationalId: z.string().max(50).optional(),
    dateOfBirth: z.string().optional().transform(val => val || null),
    address: z.string().max(255).optional(),
    postalCode: z.string().max(20).optional(),
});

export const GET = withErrorHandler(async (request: NextRequest) => {
    return withAuth(request, async (req: AuthenticatedRequest) => {
        // Only for type 'customer'
        const { customer } = req;
        if (!customer) return errorResponse('Unauthorized', 401);

        // Fetch full details
        const rows = await query<RowDataPacket[]>(
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
            pendingRequest: null
        });

    }, { requiredType: 'customer' });
});

export const PUT = withErrorHandler(async (request: NextRequest) => {
    return withAuth(request, async (req: AuthenticatedRequest) => {
        const { customer } = req;
        if (!customer) return errorResponse('Unauthorized', 401);

        // Validate request body
        const validation = await validateBody(request, updateProfileSchema);
        if (!validation.success) {
            return validation.response;
        }

        const { firstName, lastName, phone, nationalId, dateOfBirth, address, postalCode } = validation.data;

        // Build dynamic update query
        const updates: string[] = [];
        const params: any[] = [];

        if (firstName !== undefined) {
            updates.push('first_name = ?');
            params.push(firstName);
        }
        if (lastName !== undefined) {
            updates.push('last_name = ?');
            params.push(lastName);
        }
        if (phone !== undefined) {
            updates.push('phone = ?');
            params.push(phone);
        }
        if (nationalId !== undefined) {
            updates.push('national_id = ?');
            params.push(nationalId);
        }
        if (dateOfBirth !== undefined) {
            updates.push('date_of_birth = ?');
            params.push(dateOfBirth || null);
        }
        if (address !== undefined) {
            updates.push('address_line1 = ?');
            params.push(address);
        }
        if (postalCode !== undefined) {
            updates.push('postal_code = ?');
            params.push(postalCode);
        }

        if (updates.length === 0) {
            return errorResponse('No fields to update', 400);
        }

        // Add updated_at timestamp and customer id
        updates.push('updated_at = NOW()');
        params.push(customer.id);

        await execute(
            `UPDATE customers SET ${updates.join(', ')} WHERE id = ?`,
            params
        );

        return successResponse({ message: 'Profile updated successfully' });

    }, { requiredType: 'customer' });
});

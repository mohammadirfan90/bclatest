import { NextRequest } from 'next/server';
import {
    withErrorHandler,
    withAuth,
    successResponse,
    errorResponse,
    AuthenticatedRequest,
    validationErrorResponse,
} from '@/lib/api-utils';
import { z } from 'zod';
import { queryOne, execute } from '@/lib/db';
import { RowDataPacket } from 'mysql2/promise';

const changePasswordSchema = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'New password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Confirm password is required'),
}).refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
});

/**
 * POST /api/v1/customer/profile/password
 * Change customer password
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
    return withAuth(
        request,
        async (req: AuthenticatedRequest) => {
            const { customer } = req;
            if (!customer) {
                return errorResponse('Unauthorized', 401);
            }

            // Parse and validate body
            const body = await request.json();
            const result = changePasswordSchema.safeParse(body);

            if (!result.success) {
                return validationErrorResponse(
                    result.error.issues.map((e) => ({
                        field: e.path.join('.'),
                        message: e.message,
                    }))
                );
            }

            const { currentPassword, newPassword } = result.data;

            // Import auth functions
            const { verifyPassword, hashPassword } = await import('@/lib/services/auth-service');

            // Verify current password
            const customerRow = await queryOne<RowDataPacket>(
                'SELECT password_hash FROM customers WHERE id = ?',
                [customer.id]
            );

            if (!customerRow) {
                return errorResponse('Customer not found', 404);
            }

            const isValid = await verifyPassword(currentPassword, customerRow.password_hash);
            if (!isValid) {
                return errorResponse('Current password is incorrect', 400);
            }

            // Hash new password and update
            const newPasswordHash = await hashPassword(newPassword);
            await execute(
                'UPDATE customers SET password_hash = ?, updated_at = NOW() WHERE id = ?',
                [newPasswordHash, customer.id]
            );

            return successResponse({
                message: 'Password changed successfully',
            });
        },
        {
            requiredType: 'customer',
        }
    );
});

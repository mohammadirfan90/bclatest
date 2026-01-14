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
import { createUserSchema, paginationSchema } from '@/lib/validations/schemas';
import { query } from '@/lib/db';
import { RowDataPacket } from 'mysql2/promise';
import { createUser } from '@/lib/services/auth-service';

interface UserRow extends RowDataPacket {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    role_code: string;
    role_name: string;
    status: string;
    last_login_at: Date | null;
    created_at: Date;
}

interface CountRow extends RowDataPacket {
    count: number;
}

// =============================================================================
// GET /api/v1/admin/users - List users
// =============================================================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    return withAuth(
        request,
        async () => {
            const validation = validateQuery(request, paginationSchema);
            if (!validation.success) {
                return validation.response;
            }

            const { page, limit } = validation.data;
            const offset = getOffset(page, limit);

            const [countRow] = await query<CountRow[]>(
                `SELECT COUNT(*) as count FROM users`
            );

            const users = await query<UserRow[]>(
                `SELECT u.id, u.email, u.first_name, u.last_name,
              r.code as role_code, r.name as role_name,
              u.status, u.last_login_at, u.created_at
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id
       ORDER BY u.created_at DESC
       LIMIT ? OFFSET ?`,
                [limit, offset]
            );

            return successResponse(
                users.map((u) => ({
                    id: u.id,
                    email: u.email,
                    firstName: u.first_name,
                    lastName: u.last_name,
                    roleCode: u.role_code,
                    roleName: u.role_name,
                    status: u.status,
                    lastLoginAt: u.last_login_at,
                    createdAt: u.created_at,
                })),
                getPaginationMeta(page, limit, countRow?.count || 0)
            );
        },
        {
            requiredType: 'user',
            requiredRoles: ['ADMIN'],
            hideFailure: true,
        }
    );
});

// =============================================================================
// POST /api/v1/admin/users - Create user
// =============================================================================

export const POST = withErrorHandler(async (request: NextRequest) => {
    return withAuth(
        request,
        async (authReq: AuthenticatedRequest) => {
            const validation = await validateBody(request, createUserSchema);
            if (!validation.success) {
                return validation.response;
            }

            const { email, password, firstName, lastName, roleId } = validation.data;

            const result = await createUser(
                email,
                password,
                firstName,
                lastName,
                roleId,
                authReq.user!.id
            );

            if (!result.success) {
                return errorResponse(result.error || 'Failed to create user');
            }

            return createdResponse({ userId: result.userId });
        },
        {
            requiredType: 'user',
            requiredRoles: ['ADMIN'],
            hideFailure: true,
        }
    );
});

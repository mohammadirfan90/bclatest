import { NextRequest } from 'next/server';
import { withAuth, AuthenticatedRequest, withErrorHandler, successResponse, errorResponse } from '@/lib/api-utils';
import { query } from '@/lib/db';
import { RowDataPacket } from 'mysql2/promise';

interface RoleRow extends RowDataPacket {
    id: number;
    code: string;
    name: string;
    description: string;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
    return withAuth(request, async (req: AuthenticatedRequest) => {
        const { user } = req;
        if (!user || user.roleCode !== 'ADMIN') {
            return errorResponse('Unauthorized', 403);
        }

        const roles = await query<RoleRow[]>(`
            SELECT r.id, r.code, r.name, r.description
            FROM roles r
            ORDER BY r.name
        `);

        return successResponse(roles);
    }, { requiredRoles: ['ADMIN'] });
});

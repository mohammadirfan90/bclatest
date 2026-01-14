import { NextRequest } from 'next/server';
import { withAuth, AuthenticatedRequest, withErrorHandler, successResponse, errorResponse } from '@/lib/api-utils';
import { query } from '@/lib/db';
import { RowDataPacket } from 'mysql2/promise';

interface ConfigRow extends RowDataPacket {
    id: number;
    config_key: string;
    config_value: string;
    value_type: string;
    description: string;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
    return withAuth(request, async (req: AuthenticatedRequest) => {
        const { user } = req;
        if (!user || user.roleCode !== 'ADMIN') {
            return errorResponse('Unauthorized', 403);
        }

        const configs = await query<ConfigRow[]>(`
            SELECT id, config_key, config_value, value_type, description
            FROM system_config
            ORDER BY config_key
        `);

        return successResponse(configs);
    }, { requiredRoles: ['ADMIN'] });
});

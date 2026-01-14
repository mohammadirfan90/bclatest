
import { NextRequest } from 'next/server';
import { withAuth, AuthenticatedRequest } from '@/lib/api-utils';
import { withErrorHandler, successResponse, getPaginationMeta } from '@/lib/api-utils';
import { query } from '@/lib/db';
import { RowDataPacket } from 'mysql2/promise';

export const GET = withErrorHandler(async (request: NextRequest) => {
    return withAuth(request, async (req: AuthenticatedRequest) => {
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '50');
        const offset = (page - 1) * limit;

        const accountId = searchParams.get('accountId');
        const type = searchParams.get('type');
        const status = searchParams.get('status');
        const startDate = searchParams.get('startDate'); // YYYY-MM-DD
        const endDate = searchParams.get('endDate'); // YYYY-MM-DD

        let whereClause = 'WHERE 1=1';
        const params: any[] = [];

        if (accountId) {
            whereClause += ' AND (t.source_account_id = ? OR t.destination_account_id = ?)';
            params.push(accountId, accountId);
        }

        if (type) {
            whereClause += ' AND tt.code = ?';
            params.push(type);
        }

        if (status) {
            whereClause += ' AND t.status = ?';
            params.push(status);
        }

        if (startDate) {
            whereClause += ' AND t.created_at >= ?';
            params.push(startDate);
        }

        if (endDate) {
            whereClause += ' AND t.created_at <= ?';
            params.push(endDate + ' 23:59:59');
        }

        // Count total
        const countResult = await query<RowDataPacket[]>(
            `SELECT COUNT(*) as total 
             FROM transactions t
             INNER JOIN transaction_types tt ON t.transaction_type_id = tt.id
             ${whereClause}`,
            params
        );
        const total = countResult[0].total;

        // Fetch Data
        const rows = await query<RowDataPacket[]>(
            `SELECT t.id, t.transaction_reference, t.amount, t.currency, t.status, t.description, t.created_at,
                    tt.code as type, tt.name as type_name,
                    sa.account_number as source_account,
                    da.account_number as dest_account,
                    c_source.first_name as source_owner,
                    c_dest.first_name as dest_owner
             FROM transactions t
             INNER JOIN transaction_types tt ON t.transaction_type_id = tt.id
             LEFT JOIN accounts sa ON t.source_account_id = sa.id
             LEFT JOIN accounts da ON t.destination_account_id = da.id
             LEFT JOIN customers c_source ON sa.customer_id = c_source.id
             LEFT JOIN customers c_dest ON da.customer_id = c_dest.id
             ${whereClause}
             ORDER BY t.created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, limit, offset]
        );

        return successResponse(rows, getPaginationMeta(page, limit, total));
    }, { requiredRoles: ['BANKER', 'ADMIN'], hideFailure: true });
});

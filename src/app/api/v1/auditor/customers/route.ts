/**
 * GET /api/v1/auditor/customers - Get all customers (read-only)
 * 
 * Access: Auditor, Admin only
 */

import { NextRequest } from 'next/server';
import {
    withErrorHandler,
    withAuth,
    successResponse,
    AuthenticatedRequest,
} from '@/lib/api-utils';
import { query, queryOne } from '@/lib/db';
import { RowDataPacket } from 'mysql2/promise';

export const GET = withErrorHandler(async (request: NextRequest) => {
    return withAuth(
        request,
        async (_req: AuthenticatedRequest) => {
            const searchParams = request.nextUrl.searchParams;
            const limit = parseInt(searchParams.get('limit') || '50');
            const offset = parseInt(searchParams.get('offset') || '0');
            const search = searchParams.get('search');
            const status = searchParams.get('status');

            const conditions: string[] = ['1=1'];
            const params: unknown[] = [];

            if (search) {
                conditions.push('(c.email LIKE ? OR c.customer_number LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ?)');
                const searchPattern = `%${search}%`;
                params.push(searchPattern, searchPattern, searchPattern, searchPattern);
            }

            if (status) {
                conditions.push('c.status = ?');
                params.push(status);
            }

            const whereClause = conditions.join(' AND ');

            interface CountRow extends RowDataPacket {
                total: number;
            }
            const countRow = await queryOne<CountRow>(
                `SELECT COUNT(*) as total FROM customers c WHERE ${whereClause}`,
                params
            );

            interface CustomerRow extends RowDataPacket {
                id: number;
                customer_number: string;
                email: string;
                first_name: string;
                last_name: string;
                phone: string | null;
                status: string;
                kyc_status: string;
                created_at: Date;
                account_count: number;
            }

            const rows = await query<CustomerRow[]>(
                `SELECT c.id, c.customer_number, c.email, c.first_name, c.last_name,
                        c.phone, c.status, c.kyc_status, c.created_at,
                        (SELECT COUNT(*) FROM accounts WHERE customer_id = c.id) as account_count
                 FROM customers c
                 WHERE ${whereClause}
                 ORDER BY c.created_at DESC
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            return successResponse({
                customers: rows.map(row => ({
                    id: row.id,
                    customerNumber: row.customer_number,
                    email: row.email,
                    firstName: row.first_name,
                    lastName: row.last_name,
                    phone: row.phone,
                    status: row.status,
                    kycStatus: row.kyc_status,
                    createdAt: row.created_at,
                    accountCount: row.account_count,
                })),
                total: countRow?.total || 0,
                limit,
                offset,
            });
        },
        {
            requiredType: 'user',
            requiredRoles: ['AUDITOR', 'ADMIN'],
        }
    );
});

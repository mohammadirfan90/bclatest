/**
 * GET /api/v1/auditor/accounts - Get all accounts (read-only)
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
            const accountType = searchParams.get('accountType');

            const conditions: string[] = ['1=1'];
            const params: unknown[] = [];

            if (search) {
                conditions.push('(a.account_number LIKE ? OR c.email LIKE ? OR c.customer_number LIKE ?)');
                const searchPattern = `%${search}%`;
                params.push(searchPattern, searchPattern, searchPattern);
            }

            if (status) {
                conditions.push('a.status = ?');
                params.push(status);
            }

            if (accountType) {
                conditions.push('at.code = ?');
                params.push(accountType);
            }

            const whereClause = conditions.join(' AND ');

            interface CountRow extends RowDataPacket {
                total: number;
            }
            const countRow = await queryOne<CountRow>(
                `SELECT COUNT(*) as total 
                 FROM accounts a
                 JOIN customers c ON c.id = a.customer_id
                 JOIN account_types at ON at.id = a.account_type_id
                 WHERE ${whereClause}`,
                params
            );

            interface AccountRow extends RowDataPacket {
                id: number;
                account_number: string;
                customer_id: number;
                customer_number: string;
                customer_name: string;
                account_type: string;
                account_type_name: string;
                status: string;
                available_balance: string;
                currency: string;
                created_at: Date;
            }

            const rows = await query<AccountRow[]>(
                `SELECT a.id, a.account_number, a.customer_id, c.customer_number,
                        CONCAT(c.first_name, ' ', c.last_name) as customer_name,
                        at.code as account_type, at.name as account_type_name,
                        a.status, 
                        COALESCE(ab.available_balance, 0) as available_balance,
                        COALESCE(ab.currency, 'BDT') as currency,
                        a.created_at
                 FROM accounts a
                 JOIN customers c ON c.id = a.customer_id
                 JOIN account_types at ON at.id = a.account_type_id
                 LEFT JOIN account_balances ab ON ab.account_id = a.id
                 WHERE ${whereClause}
                 ORDER BY a.created_at DESC
                 LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            return successResponse({
                accounts: rows.map(row => ({
                    id: row.id,
                    accountNumber: row.account_number,
                    customerId: row.customer_id,
                    customerNumber: row.customer_number,
                    customerName: row.customer_name,
                    accountType: row.account_type,
                    accountTypeName: row.account_type_name,
                    status: row.status,
                    balance: parseFloat(row.available_balance),
                    currency: row.currency,
                    createdAt: row.created_at,
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

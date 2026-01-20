/**
 * GET /api/v1/core/stats - Get dashboard statistics
 * 
 * Version: 1.0.0
 * Access: Banker, Admin
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

interface StatsRow extends RowDataPacket {
    count: number;
}

interface VolumeRow extends RowDataPacket {
    date: string;
    count: number;
    total: string;
}

interface TypeRow extends RowDataPacket {
    type: string;
    count: number;
    total: string;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
    return withAuth(
        request,
        async (_req: AuthenticatedRequest) => {
            // Get total customers
            const customerCount = await queryOne<StatsRow>(
                `SELECT COUNT(*) as count FROM customers WHERE status = 'ACTIVE'`
            );

            // Get active accounts (Customers only)
            const accountCount = await queryOne<StatsRow>(
                `SELECT COUNT(*) as count 
                 FROM accounts a
                 INNER JOIN account_types at ON a.account_type_id = at.id
                 WHERE a.status = 'ACTIVE' AND at.code != 'INTERNAL'`
            );

            // Get today's transactions
            const todayTransactions = await queryOne<StatsRow>(
                `SELECT COUNT(*) as count FROM transactions 
                 WHERE DATE(created_at) = CURDATE() AND status = 'COMPLETED'`
            );

            // Get total balance across all customer accounts
            const totalBalance = await queryOne<RowDataPacket & { total: string }>(
                `SELECT COALESCE(SUM(ab.available_balance), 0) as total 
                 FROM account_balances ab
                 INNER JOIN accounts a ON ab.account_id = a.id
                 INNER JOIN account_types at ON a.account_type_id = at.id
                 WHERE at.code != 'INTERNAL'`
            );

            // Get transaction volume by day (last 7 days)
            const dailyVolume = await query<VolumeRow[]>(
                `SELECT 
                    DATE(created_at) as date,
                    COUNT(*) as count,
                    SUM(amount) as total
                 FROM transactions
                 WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
                   AND status = 'COMPLETED'
                 GROUP BY DATE(created_at)
                 ORDER BY date ASC`
            );

            // Get transaction breakdown by type
            const typeBreakdown = await query<TypeRow[]>(
                `SELECT 
                    tt.code as type,
                    COUNT(*) as count,
                    SUM(t.amount) as total
                 FROM transactions t
                 INNER JOIN transaction_types tt ON tt.id = t.transaction_type_id
                 WHERE t.status = 'COMPLETED'
                 GROUP BY tt.code`
            );

            // Get recent transactions (last 5)
            interface RecentTxRow extends RowDataPacket {
                id: number;
                type: string;
                amount: string;
                account_number: string;
                created_at: Date;
            }
            const recentTransactions = await query<RecentTxRow[]>(
                `SELECT 
                    t.id,
                    tt.code as type,
                    t.amount,
                    COALESCE(a.account_number, 'N/A') as account_number,
                    t.created_at
                 FROM transactions t
                 INNER JOIN transaction_types tt ON tt.id = t.transaction_type_id
                 LEFT JOIN accounts a ON a.id = COALESCE(t.destination_account_id, t.source_account_id)
                 WHERE t.status = 'COMPLETED'
                 ORDER BY t.created_at DESC
                 LIMIT 5`
            );

            return successResponse({
                summary: {
                    totalCustomers: customerCount?.count || 0,
                    activeAccounts: accountCount?.count || 0,
                    todayTransactions: todayTransactions?.count || 0,
                    totalBalance: parseFloat(totalBalance?.total || '0'),
                },
                charts: {
                    dailyVolume: dailyVolume.map(row => ({
                        date: row.date,
                        count: row.count,
                        total: parseFloat(row.total || '0'),
                    })),
                    typeBreakdown: typeBreakdown.map(row => ({
                        type: row.type,
                        count: row.count,
                        total: parseFloat(row.total || '0'),
                    })),
                },
                recentTransactions: recentTransactions.map(row => ({
                    id: row.id,
                    type: row.type,
                    amount: parseFloat(row.amount),
                    accountNumber: row.account_number,
                    createdAt: row.created_at,
                })),
            });
        },
        {
            requiredType: 'user',
            requiredRoles: ['BANKER', 'ADMIN'],
        }
    );
});

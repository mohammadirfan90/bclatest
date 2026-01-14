import { NextRequest } from 'next/server';
import { withAuth, AuthenticatedRequest, successResponse, errorResponse, withErrorHandler } from '@/lib/api-utils';
import { query } from '@/lib/db';
import { RowDataPacket } from 'mysql2/promise';

/**
 * GET /api/v1/customer/stats
 * Get aggregated statistics for customer dashboard
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
    return withAuth(request, async (req: AuthenticatedRequest) => {
        const { user } = req;
        if (!user || user.roleCode !== 'CUSTOMER') {
            return errorResponse('Unauthorized', 403);
        }

        const customerId = user.id; // Correct - customer user id maps to customer id in this simplified schema? 
        // Wait, in auth-service, we found that:
        // const customer = await queryOne('SELECT * FROM customers WHERE email = ?', [email]);
        // And the JWT stores the user.id which IS the customer.id from the customers table.
        // So yes, user.id is correct.

        // 1. Total Balance
        const balanceRow = await query<RowDataPacket[]>(
            `SELECT COALESCE(SUM(available_balance), 0) as total_balance 
             FROM accounts 
             LEFT JOIN account_balances ab ON ab.account_id = accounts.id
             WHERE customer_id = ?`,
            [customerId]
        );
        const totalBalance = parseFloat(balanceRow[0].total_balance);

        // 2. Monthly Incoming/Outgoing (Last 6 months)
        const monthlyStats = await query<RowDataPacket[]>(
            `SELECT 
                DATE_FORMAT(entry_date, '%Y-%m') as month,
                SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END) as income,
                SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END) as expense
             FROM ledger_entries le
             JOIN accounts a ON a.id = le.account_id
             WHERE a.customer_id = ? 
               AND entry_date >= Date_ADD(LAST_DAY(DATE_SUB(NOW(), INTERVAL 6 MONTH)), INTERVAL 1 DAY)
             GROUP BY DATE_FORMAT(entry_date, '%Y-%m')
             ORDER BY month ASC`,
            [customerId]
        );

        // 3. Spending by Category (Actually, we don't have categories in this simplified schema)
        // Instead, let's do Activity by Transaction Type
        const activityStats = await query<RowDataPacket[]>(
            `SELECT 
                tt.code as type,
                COUNT(*) as count
             FROM transactions t
             JOIN transaction_types tt ON tt.id = t.transaction_type_id
             JOIN accounts a ON (a.id = t.source_account_id OR a.id = t.destination_account_id)
             WHERE a.customer_id = ?
             GROUP BY tt.code`,
            [customerId]
        );

        return successResponse({
            totalBalance,
            monthlyStats: monthlyStats.map(row => ({
                month: row.month,
                income: parseFloat(row.income),
                expense: parseFloat(row.expense)
            })),
            activityStats: activityStats.map(row => ({
                type: row.type,
                count: row.count
            }))
        });

    }, { requiredRoles: ['CUSTOMER'] });
});

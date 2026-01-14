
import { NextRequest } from 'next/server';
import { withAuth, AuthenticatedRequest } from '@/lib/api-utils';
import { withErrorHandler, successResponse, errorResponse } from '@/lib/api-utils';
import { query } from '@/lib/db';
import { RowDataPacket } from 'mysql2/promise';

interface AccountSearchResult extends RowDataPacket {
    id: number;
    account_number: string;
    account_type: string;
    status: string;
    currency: string;
    customer_id: number;
    customer_number: string;
    customer_name: string;
    available_balance: string;
}

/**
 * GET /api/v1/banker/accounts/search?q=<account_number_or_customer_name>
 * Search for accounts by account number or customer name
 */
export const GET = withErrorHandler(async (request: NextRequest) => {
    return withAuth(request, async (req: AuthenticatedRequest) => {
        const { user } = req;
        if (!user || (user.roleCode !== 'BANKER' && user.roleCode !== 'ADMIN')) {
            return errorResponse('Unauthorized', 403);
        }

        const searchParams = request.nextUrl.searchParams;
        const q = searchParams.get('q') || '';

        if (q.length < 2) {
            return successResponse({ accounts: [] });
        }

        // Search by account number or customer name
        // Exclude system/internal accounts
        // Trim query and ensure robust partial matching
        const cleanQuery = q.trim();

        const accounts: AccountSearchResult[] = await query<AccountSearchResult[]>(`
            SELECT 
                a.id,
                a.account_number,
                at.code as account_type,
                a.status,
                COALESCE(ab.currency, 'BDT') as currency,
                c.id as customer_id,
                c.customer_number,
                CONCAT(c.first_name, ' ', c.last_name) as customer_name,
                COALESCE(ab.available_balance, 0) as available_balance
            FROM accounts a
            JOIN customers c ON a.customer_id = c.id
            JOIN account_types at ON at.id = a.account_type_id
            LEFT JOIN account_balances ab ON a.id = ab.account_id
            WHERE 
                at.code != 'INTERNAL'
                AND c.customer_number != 'SYSTEM-BANK'
                AND (
                    a.account_number LIKE ?
                    OR c.first_name LIKE ?
                    OR c.last_name LIKE ?
                    OR c.customer_number LIKE ?
                )
            ORDER BY a.account_number
            LIMIT 50
        `, [`%${cleanQuery}%`, `%${cleanQuery}%`, `%${cleanQuery}%`, `%${cleanQuery}%`]);

        return successResponse({
            accounts: accounts.map(a => ({
                id: a.id,
                accountNumber: a.account_number,
                accountType: a.account_type,
                status: a.status,
                currency: a.currency,
                customerId: a.customer_id,
                customerNumber: a.customer_number,
                customerName: a.customer_name,
                availableBalance: parseFloat(a.available_balance)
            }))
        });

    }, { requiredRoles: ['BANKER', 'ADMIN'], hideFailure: true });
});

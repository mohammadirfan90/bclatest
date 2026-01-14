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
import { createAccountSchema, paginationSchema } from '@/lib/validations/schemas';
import { query } from '@/lib/db';
import { RowDataPacket } from 'mysql2/promise';
import { getAccountsForCustomer } from '@/lib/services/account-service';

// =============================================================================
// GET /api/v1/accounts - List accounts
// =============================================================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    return withAuth(
        request,
        async (req: AuthenticatedRequest) => {
            const validation = validateQuery(request, paginationSchema);
            if (!validation.success) {
                return validation.response;
            }

            const { page, limit } = validation.data;
            const offset = getOffset(page, limit);

            // If customer, only show their accounts
            if (req.tokenPayload?.type === 'customer') {
                const accounts = await getAccountsForCustomer(req.customer!.id);
                return successResponse(accounts);
            }

            // For staff, show all accounts (paginated)
            interface AccountRow extends RowDataPacket {
                id: number;
                account_number: string;
                customer_id: number;
                customer_name: string;
                account_type: string;
                account_type_name: string;
                status: string;
                available_balance: string;
                created_at: Date;
            }

            interface CountRow extends RowDataPacket {
                count: number;
            }

            const [countRow] = await query<CountRow[]>(
                `SELECT COUNT(*) as count FROM accounts`
            );

            const rows = await query<AccountRow[]>(
                `SELECT a.id, a.account_number, a.customer_id,
                CONCAT(c.first_name, ' ', c.last_name) as customer_name,
                at.code as account_type, at.name as account_type_name,
                a.status, COALESCE(ab.available_balance, 0) as available_balance,
                a.created_at
         FROM accounts a
         INNER JOIN customers c ON c.id = a.customer_id
         INNER JOIN account_types at ON at.id = a.account_type_id
         LEFT JOIN account_balances ab ON ab.account_id = a.id
         ORDER BY a.created_at DESC
         LIMIT ? OFFSET ?`,
                [limit, offset]
            );

            const accounts = rows.map((row) => ({
                id: row.id,
                accountNumber: row.account_number,
                customerId: row.customer_id,
                customerName: row.customer_name,
                accountType: row.account_type,
                accountTypeName: row.account_type_name,
                status: row.status,
                availableBalance: parseFloat(row.available_balance),
                createdAt: row.created_at,
            }));

            return successResponse(accounts, getPaginationMeta(page, limit, countRow?.count || 0));
        },
        {
            requiredType: 'any',
        }
    );
});

// =============================================================================
// POST /api/v1/accounts - Create account (Banker)
// =============================================================================

// POST method removed: Accounts must be created via Application -> Approval workflow.


import { NextRequest } from 'next/server';
import { withAuth, AuthenticatedRequest, getIdempotencyKey } from '@/lib/api-utils';
import { withErrorHandler, successResponse, validationErrorResponse, errorResponse } from '@/lib/api-utils';
import { depositSchema } from '@/lib/validations/schemas';
import { callProcedure, queryOne } from '@/lib/db';
import { RowDataPacket } from 'mysql2/promise';

interface AccountDetails extends RowDataPacket {
    id: number;
    account_number: string;
    customer_name: string;
    available_balance: string;
}

export const POST = withErrorHandler(async (request: NextRequest) => {
    return withAuth(request, async (req: AuthenticatedRequest) => {
        // 1. Verify Role
        const { user } = req;
        if (!user || user.roleCode !== 'BANKER') {
            return errorResponse('Unauthorized: Only bankers can perform deposits', 403);
        }

        // 2. Get Idempotency Key from header or body
        const idempotencyKeyFromHeader = getIdempotencyKey(request);

        // 3. Parse Body
        const body = await request.json();
        const result = depositSchema.safeParse(body);

        if (!result.success) {
            return validationErrorResponse(result.error.issues.map(e => ({ field: e.path.join('.'), message: e.message })));
        }

        const { accountId, amount, description } = result.data;

        // Use header key if provided, otherwise use body key, otherwise generate one
        const idempotencyKey = idempotencyKeyFromHeader || result.data.idempotencyKey || crypto.randomUUID();

        // 4. Get account details for receipt
        const accountDetails = await queryOne<AccountDetails>(`
            SELECT a.id, a.account_number, CONCAT(c.first_name, ' ', c.last_name) as customer_name, 
                   ab.available_balance
            FROM accounts a
            JOIN customers c ON a.customer_id = c.id
            LEFT JOIN account_balances ab ON a.id = ab.account_id
            WHERE a.id = ?
        `, [accountId]);

        if (!accountDetails) {
            return errorResponse('Account not found', 404);
        }

        // 5. Call idempotency-enabled stored procedure
        const procedureResult = await callProcedure<{ transaction_id: number, status: string, message: string }>(
            'sp_teller_deposit',
            [accountId, amount, description || 'Cash Deposit', user.id, idempotencyKey],
            ['transaction_id', 'status', 'message']
        );

        const { outParams } = procedureResult;

        if (outParams.status === 'FAILED') {
            return errorResponse(outParams.message as string || 'Deposit failed', 400);
        }

        // 6. Check if this was an idempotent replay
        const isReplay = outParams.message === 'Idempotent replay';

        // 7. Return receipt data
        return successResponse({
            transactionId: outParams.transaction_id,
            transactionReference: `TXN-${outParams.transaction_id}`,
            message: outParams.message,
            status: outParams.status,
            idempotent: isReplay,
            receipt: {
                type: 'DEPOSIT',
                accountNumber: accountDetails.account_number,
                customerName: accountDetails.customer_name,
                amount: amount,
                currency: 'BDT',
                previousBalance: parseFloat(accountDetails.available_balance),
                newBalance: isReplay
                    ? parseFloat(accountDetails.available_balance) // Already updated in original request
                    : parseFloat(accountDetails.available_balance) + amount,
                description: description || 'Cash Deposit',
                tellerName: `${user.firstName} ${user.lastName}`,
                timestamp: new Date().toISOString()
            }
        });

    }, { requiredRoles: ['BANKER'], hideFailure: true });
});

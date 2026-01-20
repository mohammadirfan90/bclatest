
import { NextRequest } from 'next/server';
import { withAuth, AuthenticatedRequest, getIdempotencyKey } from '@/lib/api-utils';
import { withErrorHandler, successResponse, validationErrorResponse, errorResponse } from '@/lib/api-utils';
import { withdrawSchema } from '@/lib/validations/schemas';
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
            return errorResponse('Unauthorized: Only bankers can perform withdrawals', 403);
        }

        // 2. Get Idempotency Key from header or body
        const idempotencyKeyFromHeader = getIdempotencyKey(request);

        // 3. Parse Body
        const body = await request.json();
        const result = withdrawSchema.safeParse(body);

        if (!result.success) {
            return validationErrorResponse(result.error.issues.map(e => ({ field: e.path.join('.'), message: e.message })));
        }

        const { accountId, amount, description } = result.data;

        // Use header key if provided, otherwise use body key, otherwise generate one
        const idempotencyKey = idempotencyKeyFromHeader || result.data.idempotencyKey || crypto.randomUUID();

        // 4. Get account details for receipt and balance check display
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

        const currentBalance = parseFloat(accountDetails.available_balance);

        // 5. Call core stored procedure
        const procedureResult = await callProcedure<{ p_transaction_id: number, p_status: string, p_message: string }>(
            'sp_withdraw',
            [accountId, amount, description || 'Cash Withdrawal', user.id],
            ['p_transaction_id', 'p_status', 'p_message']
        );

        const { outParams } = procedureResult;

        if (outParams.p_status === 'FAILED') {
            return errorResponse(outParams.p_message as string || 'Withdrawal failed', 400);
        }

        const transactionId = outParams.p_transaction_id;
        const status = outParams.p_status;
        const message = outParams.p_message;

        // 6. Check if this was an idempotent replay
        const isReplay = outParams.message === 'Idempotent replay';

        // 7. Return receipt data
        return successResponse({
            transactionId: transactionId,
            transactionReference: `TXN-${transactionId}`,
            message: message,
            status: status,
            idempotent: false,
            receipt: {
                type: 'WITHDRAWAL',
                accountNumber: accountDetails.account_number,
                customerName: accountDetails.customer_name,
                amount: amount,
                currency: 'BDT',
                previousBalance: currentBalance,
                newBalance: isReplay
                    ? currentBalance // Already updated in original request
                    : currentBalance - amount,
                description: description || 'Cash Withdrawal',
                tellerName: `${user.firstName} ${user.lastName}`,
                timestamp: new Date().toISOString()
            }
        });

    }, { requiredRoles: ['BANKER'], hideFailure: true });
});

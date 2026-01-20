import { NextRequest } from 'next/server';
import {
    withErrorHandler,
    withAuth,
    validateBody,
    validateQuery,
    successResponse,
    errorResponse,
    checkIdempotency,
    getPaginationMeta,
    getOffset,
    AuthenticatedRequest,
} from '@/lib/api-utils';
import {
    transferSchema,
    depositSchema,
    withdrawSchema,
    transactionSearchSchema,
} from '@/lib/validations/schemas';
import {
    transfer,
    deposit,
    withdraw,
    getTransactionsForAccount,
} from '@/lib/services/transaction-service';
import { getAccountById } from '@/lib/services/account-service';
import { query } from '@/lib/db';
import { RowDataPacket } from 'mysql2/promise';

// =============================================================================
// GET /api/v1/transactions - List transactions
// =============================================================================

export const GET = withErrorHandler(async (request: NextRequest) => {
    return withAuth(
        request,
        async (req: AuthenticatedRequest) => {
            const validation = validateQuery(request, transactionSearchSchema);
            if (!validation.success) {
                return validation.response;
            }

            const { accountId, startDate, endDate, status, page, limit } = validation.data;
            const offset = getOffset(page, limit);

            // For customers, require accountId and verify ownership
            if (req.tokenPayload?.type === 'customer') {
                if (!accountId) {
                    return errorResponse('Account ID is required');
                }

                const account = await getAccountById(accountId);
                if (!account || account.customerId !== req.customer?.id) {
                    return errorResponse('Account not found');
                }

                const result = await getTransactionsForAccount(accountId, {
                    limit,
                    offset,
                    startDate: startDate ? new Date(startDate) : undefined,
                    endDate: endDate ? new Date(endDate) : undefined,
                });

                return successResponse(
                    result.transactions,
                    getPaginationMeta(page, limit, result.total)
                );
            }

            // For staff, can query all transactions or filter by account
            if (accountId) {
                const result = await getTransactionsForAccount(accountId, {
                    limit,
                    offset,
                    startDate: startDate ? new Date(startDate) : undefined,
                    endDate: endDate ? new Date(endDate) : undefined,
                });

                return successResponse(
                    result.transactions,
                    getPaginationMeta(page, limit, result.total)
                );
            }

            // Query all transactions
            interface TransactionRow extends RowDataPacket {
                id: number;
                transaction_reference: string;
                transaction_type: string;
                amount: string;
                currency: string;
                description: string | null;
                status: string;
                source_account_number: string | null;
                destination_account_number: string | null;
                processed_at: Date | null;
                created_at: Date;
            }

            interface CountRow extends RowDataPacket {
                count: number;
            }

            const conditions: string[] = ['1=1'];
            const params: unknown[] = [];

            if (status) {
                conditions.push('t.status = ?');
                params.push(status);
            }

            if (startDate) {
                conditions.push('t.created_at >= ?');
                params.push(startDate);
            }

            if (endDate) {
                conditions.push('t.created_at <= ?');
                params.push(endDate);
            }

            const whereClause = conditions.join(' AND ');

            const [countRow] = await query<CountRow[]>(
                `SELECT COUNT(*) as count FROM transactions t WHERE ${whereClause}`,
                params
            );

            const rows = await query<TransactionRow[]>(
                `SELECT t.id, t.transaction_reference, tt.code as transaction_type,
                t.amount, t.currency, t.description, t.status,
                sa.account_number as source_account_number,
                da.account_number as destination_account_number,
                t.processed_at, t.created_at
         FROM transactions t
         INNER JOIN transaction_types tt ON tt.id = t.transaction_type_id
         LEFT JOIN accounts sa ON sa.id = t.source_account_id
         LEFT JOIN accounts da ON da.id = t.destination_account_id
         WHERE ${whereClause}
         ORDER BY t.created_at DESC
         LIMIT ? OFFSET ?`,
                [...params, limit, offset]
            );

            const transactions = rows.map((row) => ({
                id: row.id,
                transactionReference: row.transaction_reference,
                transactionType: row.transaction_type,
                amount: parseFloat(row.amount),
                currency: row.currency,
                description: row.description,
                status: row.status,
                sourceAccountNumber: row.source_account_number,
                destinationAccountNumber: row.destination_account_number,
                processedAt: row.processed_at,
                createdAt: row.created_at,
            }));

            return successResponse(
                transactions,
                getPaginationMeta(page, limit, countRow?.count || 0)
            );
        },
        {
            requiredType: 'any',
        }
    );
});

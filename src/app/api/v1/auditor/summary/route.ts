/**
 * GET /api/v1/auditor/summary - Get audit dashboard summary
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
import { getAuditStats } from '@/lib/services/audit-service';
import { verifyDoubleEntry, verifyBalanceIntegrity, getAllTransactions } from '@/lib/services/transaction-service';
import { query, queryOne } from '@/lib/db';
import { RowDataPacket } from 'mysql2/promise';

export const GET = withErrorHandler(async (request: NextRequest) => {
    return withAuth(
        request,
        async (_req: AuthenticatedRequest) => {
            // Get audit stats
            const auditStats = await getAuditStats();

            // Get transaction counts
            interface CountRow extends RowDataPacket {
                total: number;
            }
            const transactionCount = await queryOne<CountRow>(
                'SELECT COUNT(*) as total FROM transactions'
            );

            const todayTransactions = await queryOne<CountRow>(
                'SELECT COUNT(*) as total FROM transactions WHERE DATE(created_at) = CURDATE()'
            );

            // Get account counts
            const accountCount = await queryOne<CountRow>(
                'SELECT COUNT(*) as total FROM accounts'
            );

            const activeAccounts = await queryOne<CountRow>(
                "SELECT COUNT(*) as total FROM accounts WHERE status = 'ACTIVE'"
            );

            // Get customer counts
            const customerCount = await queryOne<CountRow>(
                'SELECT COUNT(*) as total FROM customers'
            );

            // Verify ledger integrity
            const doubleEntryCheck = await verifyDoubleEntry();
            const balanceCheck = await verifyBalanceIntegrity();

            return successResponse({
                auditLogs: {
                    total: auditStats.totalLogs,
                    today: auditStats.todayLogs,
                    byAction: auditStats.actionCounts,
                },
                transactions: {
                    total: transactionCount?.total || 0,
                    today: todayTransactions?.total || 0,
                },
                accounts: {
                    total: accountCount?.total || 0,
                    active: activeAccounts?.total || 0,
                },
                customers: {
                    total: customerCount?.total || 0,
                },
                integrity: {
                    doubleEntryValid: doubleEntryCheck.valid,
                    doubleEntryDiscrepancy: doubleEntryCheck.discrepancy,
                    balanceIntegrityValid: balanceCheck.valid,
                    balanceDiscrepancies: balanceCheck.discrepancies.length,
                },
            });
        },
        {
            requiredType: 'user',
            requiredRoles: ['AUDITOR', 'ADMIN'],
        }
    );
});

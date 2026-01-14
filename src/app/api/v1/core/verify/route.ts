/**
 * GET /api/v1/core/verify - Verify system integrity
 * 
 * Version: 1.0.0
 * Access: Admin only
 * 
 * Returns double-entry verification and balance integrity checks
 */

import { NextRequest } from 'next/server';
import {
    withErrorHandler,
    withAuth,
    successResponse,
    AuthenticatedRequest,
} from '@/lib/api-utils';
import { verifyDoubleEntry, verifyBalanceIntegrity } from '@/lib/services/transaction-service';

export const GET = withErrorHandler(async (request: NextRequest) => {
    return withAuth(
        request,
        async (_req: AuthenticatedRequest) => {
            // Run verification checks
            const [doubleEntry, balanceIntegrity] = await Promise.all([
                verifyDoubleEntry(),
                verifyBalanceIntegrity(),
            ]);

            const allValid = doubleEntry.valid && balanceIntegrity.valid;

            return successResponse({
                valid: allValid,
                doubleEntry: {
                    valid: doubleEntry.valid,
                    discrepancy: doubleEntry.discrepancy,
                    message: doubleEntry.valid
                        ? 'All debits and credits are balanced'
                        : `Discrepancy of ${doubleEntry.discrepancy} found`,
                },
                balanceIntegrity: {
                    valid: balanceIntegrity.valid,
                    discrepancies: balanceIntegrity.discrepancies,
                    message: balanceIntegrity.valid
                        ? 'All materialized balances match ledger'
                        : `${balanceIntegrity.discrepancies.length} accounts have balance discrepancies`,
                },
            });
        },
        {
            requiredType: 'user',
            requiredRoles: ['ADMIN'],
        }
    );
});

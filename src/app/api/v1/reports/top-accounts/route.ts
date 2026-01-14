/**
 * GET /api/v1/reports/top-accounts
 * 
 * Returns top accounts ranked by various metrics.
 * Query params:
 *   - month: YYYY-MM format (required)
 *   - category: HIGHEST_BALANCE | MOST_TRANSACTIONS | HIGHEST_VOLUME (optional)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/services/auth-service';
import { getTopAccounts } from '@/lib/services/analytics-service';

export async function GET(request: NextRequest) {
    try {
        // Verify authentication - bankers and admins only
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!['ADMIN', 'BANKER'].includes(session.role || '')) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const monthParam = searchParams.get('month');
        const category = searchParams.get('category') as
            'HIGHEST_BALANCE' | 'MOST_TRANSACTIONS' | 'HIGHEST_VOLUME' | null;

        if (!monthParam) {
            return NextResponse.json(
                { error: 'Month parameter is required (YYYY-MM format)' },
                { status: 400 }
            );
        }

        // Parse month parameter
        const match = monthParam.match(/^(\d{4})-(\d{2})$/);
        if (!match) {
            return NextResponse.json(
                { error: 'Invalid month format. Use YYYY-MM' },
                { status: 400 }
            );
        }

        const year = parseInt(match[1]);
        const month = parseInt(match[2]);

        // Validate category if provided
        if (category && !['HIGHEST_BALANCE', 'MOST_TRANSACTIONS', 'HIGHEST_VOLUME'].includes(category)) {
            return NextResponse.json(
                { error: 'Invalid category. Must be HIGHEST_BALANCE, MOST_TRANSACTIONS, or HIGHEST_VOLUME' },
                { status: 400 }
            );
        }

        // Get top accounts
        const topAccounts = await getTopAccounts(year, month, category || undefined);

        // Group by category if no specific category requested
        const grouped = category
            ? { [category]: topAccounts }
            : topAccounts.reduce((acc, account) => {
                if (!acc[account.category]) {
                    acc[account.category] = [];
                }
                acc[account.category].push(account);
                return acc;
            }, {} as Record<string, typeof topAccounts>);

        return NextResponse.json({
            success: true,
            data: grouped,
            meta: {
                year,
                month,
                category: category || 'ALL',
            },
        });
    } catch (error) {
        console.error('Top accounts error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch top accounts' },
            { status: 500 }
        );
    }
}

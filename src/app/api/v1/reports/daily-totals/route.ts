/**
 * GET /api/v1/reports/daily-totals
 * 
 * Returns daily aggregate totals for accounts.
 * Query params:
 *   - date: YYYY-MM-DD format (required)
 *   - accountId: (optional) filter to specific account
 *   - page: (optional) pagination page, default 1
 *   - size: (optional) page size, default 50
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/services/auth-service';
import { getDailyTotals, getDailySystemTotals, getDailyTransactionSummary } from '@/lib/services/analytics-service';

export async function GET(request: NextRequest) {
    let date: string | null = null;
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
        date = searchParams.get('date');
        const accountId = searchParams.get('accountId');
        const page = parseInt(searchParams.get('page') || '1');
        const size = parseInt(searchParams.get('size') || '50');

        if (!date) {
            return NextResponse.json(
                { error: 'Date parameter is required (YYYY-MM-DD format)' },
                { status: 400 }
            );
        }

        // Validate date format
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return NextResponse.json(
                { error: 'Invalid date format. Use YYYY-MM-DD' },
                { status: 400 }
            );
        }

        // Get daily totals (still from precomputed if needed for detail, but summary MUST be from ledger)
        const { totals, total } = await getDailyTotals(date, {
            accountId: accountId ? parseInt(accountId) : undefined,
            page,
            size,
        });

        // Get system totals (precomputed)
        const systemTotals = await getDailySystemTotals(date);

        // Get LIVE summary from ledger (as required)
        const liveSummary = await getDailyTransactionSummary(date);

        return NextResponse.json({
            success: true,
            data: totals,
            summary: systemTotals,
            liveSummary: liveSummary,
            meta: {
                date,
                serverTime: new Date().toISOString(),
                currentPage: page,
                itemsPerPage: size,
                totalItems: total,
                totalPages: Math.ceil(total / size),
            },
        });
    } catch (error: any) {
        console.error('Daily totals error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch daily totals' },
            { status: 500 }
        );
    }
}

/**
 * GET /api/v1/reports/monthly-summary
 * 
 * Returns monthly aggregate summaries for accounts.
 * Query params:
 *   - year: YYYY format (required)
 *   - month: 1-12 (required)
 *   - accountId: (optional) filter to specific account
 *   - page: (optional) pagination page, default 1
 *   - size: (optional) page size, default 50
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/services/auth-service';
import { getMonthlySummaries, getMonthlySystemTotals } from '@/lib/services/analytics-service';

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
        const yearParam = searchParams.get('year');
        const monthParam = searchParams.get('month');
        const accountId = searchParams.get('accountId');
        const page = parseInt(searchParams.get('page') || '1');
        const size = parseInt(searchParams.get('size') || '50');

        if (!yearParam || !monthParam) {
            return NextResponse.json(
                { error: 'Year and month parameters are required' },
                { status: 400 }
            );
        }

        const year = parseInt(yearParam);
        const month = parseInt(monthParam);

        // Validate year and month
        if (isNaN(year) || year < 2020 || year > 2100) {
            return NextResponse.json(
                { error: 'Invalid year. Must be between 2020 and 2100' },
                { status: 400 }
            );
        }

        if (isNaN(month) || month < 1 || month > 12) {
            return NextResponse.json(
                { error: 'Invalid month. Must be between 1 and 12' },
                { status: 400 }
            );
        }

        // Get monthly summaries
        const { summaries, total } = await getMonthlySummaries(year, month, {
            accountId: accountId ? parseInt(accountId) : undefined,
            page,
            size,
        });

        // Get system totals
        const systemTotals = await getMonthlySystemTotals(year, month);

        return NextResponse.json({
            success: true,
            data: summaries,
            summary: systemTotals,
            meta: {
                year,
                month,
                currentPage: page,
                itemsPerPage: size,
                totalItems: total,
                totalPages: Math.ceil(total / size),
            },
        });
    } catch (error) {
        console.error('Monthly summary error:', error);
        return NextResponse.json(
            { error: 'Failed to fetch monthly summaries' },
            { status: 500 }
        );
    }
}

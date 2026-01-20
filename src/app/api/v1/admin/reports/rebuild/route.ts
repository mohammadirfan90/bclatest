/**
 * POST /api/v1/admin/reports/rebuild
 * 
 * Triggers a full rebuild of all analytics tables from ledger.
 * Admin-only endpoint. Can be long-running on large datasets.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/services/auth-service';
import { rebuildAnalytics, generateMonthlyAggregates } from '@/lib/services/analytics-service';

export async function POST(request: NextRequest) {
    try {
        // Verify authentication - admin only
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (session.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Forbidden - Admin only' }, { status: 403 });
        }

        const userId = session.user!.id;

        // Parse request body for options
        let options = { fullRebuild: true, year: 0, month: 0 };
        try {
            const body = await request.json();
            options = { ...options, ...body };
        } catch {
            // Use defaults if no body or invalid JSON
        }

        let result;

        if (options.fullRebuild) {
            // Full rebuild of all analytics
            result = await rebuildAnalytics(userId);

            return NextResponse.json({
                success: result.status === 'COMPLETED',
                data: {
                    type: 'FULL_REBUILD',
                    dailyRowsGenerated: result.dailyRows,
                    monthlyRowsGenerated: result.monthlyRows,
                    status: result.status,
                    message: result.message,
                },
            });
        } else {
            // Generate only for specific month
            if (!options.year || !options.month) {
                return NextResponse.json(
                    { error: 'year and month required when fullRebuild is false' },
                    { status: 400 }
                );
            }

            result = await generateMonthlyAggregates(options.year, options.month, userId);

            return NextResponse.json({
                success: result.status === 'COMPLETED',
                data: {
                    type: 'MONTHLY_AGGREGATE',
                    year: options.year,
                    month: options.month,
                    accountsProcessed: result.accountsProcessed,
                    status: result.status,
                    message: result.message,
                },
            });
        }
    } catch (error) {
        console.error('Analytics rebuild error:', error);
        return NextResponse.json(
            { error: 'Failed to rebuild analytics' },
            { status: 500 }
        );
    }
}

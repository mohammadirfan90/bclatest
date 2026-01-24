/**
 * GET /api/v1/auditor/export-pdf/top-accounts
 * 
 * Exports top accounts ranking as PDF
 * Query params: month (YYYY-MM)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest, withErrorHandler, errorResponse } from '@/lib/api-utils';
import { getTopAccounts } from '@/lib/services/analytics-service';
import {
    createAuditPDF,
    finalizePDF,
    drawSectionTitle,
    drawTableHeader,
    drawTableRow,
    logPdfExport,
    formatCurrency,
    TableColumn,
} from '@/lib/services/pdf-generator';

export const GET = withErrorHandler(async (request: NextRequest) => {
    return withAuth(request, async (req: AuthenticatedRequest) => {
        const { searchParams } = new URL(request.url);
        const monthParam = searchParams.get('month');

        if (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam)) {
            return errorResponse('Valid month parameter is required (YYYY-MM)');
        }

        const [yearStr, monthStr] = monthParam.split('-');
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);

        const topAccounts = await getTopAccounts(year, month);

        const monthName = new Date(year, month - 1).toLocaleString('en-US', { month: 'long' });

        const user = req.user!;
        const pdfOptions = {
            title: 'Top Accounts Report',
            subtitle: `${monthName} ${year}`,
            generatedBy: `${user.firstName} ${user.lastName}`,
            actorId: user.id,
            actorRole: user.roleCode,
        };

        const ctx = await createAuditPDF(pdfOptions);

        // Group by category
        const grouped = topAccounts.reduce((acc, account) => {
            if (!acc[account.category]) acc[account.category] = [];
            acc[account.category].push(account);
            return acc;
        }, {} as Record<string, typeof topAccounts>);

        const columns: TableColumn[] = [
            { header: 'Rank', width: 40 },
            { header: 'Account', width: 100 },
            { header: 'Customer', width: 150 },
            { header: 'Value', width: 120 },
        ];

        const categoryLabels: Record<string, string> = {
            'HIGHEST_BALANCE': 'Top Accounts by Balance',
            'MOST_TRANSACTIONS': 'Top Accounts by Transaction Count',
            'HIGHEST_VOLUME': 'Top Accounts by Transaction Volume',
        };

        for (const [category, accounts] of Object.entries(grouped)) {
            drawSectionTitle(ctx, categoryLabels[category] || category);
            drawTableHeader(ctx, columns);

            for (const acc of accounts) {
                const valueStr = category === 'MOST_TRANSACTIONS'
                    ? acc.metricValue.toString() + ' transactions'
                    : formatCurrency(acc.metricValue);

                const values = [
                    `#${acc.rank}`,
                    acc.accountNumber,
                    acc.customerName.substring(0, 25),
                    valueStr,
                ];

                drawTableRow(ctx, columns, values);
            }

            ctx.currentY -= 20;
        }

        const pdfBytes = await finalizePDF(ctx);

        logPdfExport('TOP_ACCOUNTS', user.id, user.roleCode, { year, month });

        return new NextResponse(Buffer.from(pdfBytes), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="top-accounts-${monthParam}.pdf"`,
                'Content-Length': pdfBytes.length.toString(),
            },
        });
    }, { requiredRoles: ['AUDITOR', 'ADMIN'], requiredType: 'user' });
});

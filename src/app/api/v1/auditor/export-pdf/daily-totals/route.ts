/**
 * GET /api/v1/auditor/export-pdf/daily-totals
 * 
 * Exports daily totals report as PDF
 * Query params: date (YYYY-MM-DD)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest, withErrorHandler, errorResponse } from '@/lib/api-utils';
import { getDailyTotals, getDailyTransactionSummary } from '@/lib/services/analytics-service';
import {
    createAuditPDF,
    finalizePDF,
    drawSectionTitle,
    drawSummaryRow,
    drawTableHeader,
    drawTableRow,
    addNewPage,
    logPdfExport,
    formatCurrency,
    TableColumn,
} from '@/lib/services/pdf-generator';

export const GET = withErrorHandler(async (request: NextRequest) => {
    return withAuth(request, async (req: AuthenticatedRequest) => {
        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date');

        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return errorResponse('Valid date parameter is required (YYYY-MM-DD)');
        }

        const summary = await getDailyTransactionSummary(date);
        const { totals: accountTotals, total } = await getDailyTotals(date, { size: 1000 });

        const user = req.user!;
        const pdfOptions = {
            title: 'Daily Transaction Report',
            subtitle: `Date: ${date}`,
            generatedBy: `${user.firstName} ${user.lastName}`,
            actorId: user.id,
            actorRole: user.roleCode,
        };

        const ctx = await createAuditPDF(pdfOptions);

        drawSectionTitle(ctx, 'System Summary');
        drawSummaryRow(ctx, 'Total Deposits:', formatCurrency(summary.totalDeposits));
        drawSummaryRow(ctx, 'Total Withdrawals:', formatCurrency(summary.totalWithdrawals));
        drawSummaryRow(ctx, 'Transaction Count:', summary.transactionCount.toString());
        drawSummaryRow(ctx, 'Total Volume:', formatCurrency(summary.volume));

        ctx.currentY -= 20;

        drawSectionTitle(ctx, `Account Daily Totals (${total} accounts)`);

        const columns: TableColumn[] = [
            { header: 'Account', width: 90 },
            { header: 'Customer', width: 120 },
            { header: 'Opening', width: 80 },
            { header: 'Credits', width: 70 },
            { header: 'Debits', width: 70 },
            { header: 'Closing', width: 80 },
        ];

        drawTableHeader(ctx, columns);

        for (const acc of accountTotals) {
            const values = [
                acc.accountNumber,
                acc.customerName.substring(0, 20),
                formatCurrency(acc.openingBalance),
                formatCurrency(acc.totalCredits),
                formatCurrency(acc.totalDebits),
                formatCurrency(acc.closingBalance),
            ];

            const success = drawTableRow(ctx, columns, values);
            if (!success) {
                addNewPage(ctx, pdfOptions);
                drawTableHeader(ctx, columns);
                drawTableRow(ctx, columns, values);
            }
        }

        const pdfBytes = await finalizePDF(ctx);

        logPdfExport('DAILY_TOTALS', user.id, user.roleCode, { date, accountCount: total });

        return new NextResponse(Buffer.from(pdfBytes), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="daily-report-${date}.pdf"`,
                'Content-Length': pdfBytes.length.toString(),
            },
        });
    }, { requiredRoles: ['AUDITOR', 'ADMIN'], requiredType: 'user' });
});

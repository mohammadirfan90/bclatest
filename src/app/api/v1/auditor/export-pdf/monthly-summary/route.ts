/**
 * GET /api/v1/auditor/export-pdf/monthly-summary
 * 
 * Exports monthly summary report as PDF
 * Query params: year, month
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest, withErrorHandler, errorResponse } from '@/lib/api-utils';
import { getMonthlySummaries, getMonthlySystemTotals } from '@/lib/services/analytics-service';
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
        const yearParam = searchParams.get('year');
        const monthParam = searchParams.get('month');

        if (!yearParam || !monthParam) {
            return errorResponse('Year and month parameters are required');
        }

        const year = parseInt(yearParam);
        const month = parseInt(monthParam);

        if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
            return errorResponse('Invalid year or month');
        }

        const { summaries, total } = await getMonthlySummaries(year, month, { size: 1000 });
        const systemTotals = await getMonthlySystemTotals(year, month);

        const monthName = new Date(year, month - 1).toLocaleString('en-US', { month: 'long' });

        const user = req.user!;
        const pdfOptions = {
            title: 'Monthly Summary Report',
            subtitle: `${monthName} ${year}`,
            generatedBy: `${user.firstName} ${user.lastName}`,
            actorId: user.id,
            actorRole: user.roleCode,
        };

        const ctx = await createAuditPDF(pdfOptions);

        drawSectionTitle(ctx, 'System Summary');
        drawSummaryRow(ctx, 'Total Accounts:', systemTotals.totalAccounts.toString());
        drawSummaryRow(ctx, 'Active Accounts:', systemTotals.totalActiveAccounts.toString());
        drawSummaryRow(ctx, 'Total Volume:', formatCurrency(systemTotals.totalVolume));
        drawSummaryRow(ctx, 'Total Deposits:', formatCurrency(systemTotals.totalDeposits));
        drawSummaryRow(ctx, 'Total Withdrawals:', formatCurrency(systemTotals.totalWithdrawals));
        drawSummaryRow(ctx, 'Total Transactions:', systemTotals.totalTransactions.toString());

        ctx.currentY -= 20;

        drawSectionTitle(ctx, `Account Monthly Summaries (${total} accounts)`);

        const columns: TableColumn[] = [
            { header: 'Account', width: 85 },
            { header: 'Customer', width: 100 },
            { header: 'Opening', width: 75 },
            { header: 'Credits', width: 75 },
            { header: 'Debits', width: 75 },
            { header: 'Closing', width: 75 },
        ];

        drawTableHeader(ctx, columns);

        for (const acc of summaries) {
            const values = [
                acc.accountNumber,
                acc.customerName.substring(0, 18),
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

        logPdfExport('MONTHLY_SUMMARY', user.id, user.roleCode, { year, month, accountCount: total });

        return new NextResponse(Buffer.from(pdfBytes), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="monthly-summary-${year}-${String(month).padStart(2, '0')}.pdf"`,
                'Content-Length': pdfBytes.length.toString(),
            },
        });
    }, { requiredRoles: ['AUDITOR', 'ADMIN'], requiredType: 'user' });
});

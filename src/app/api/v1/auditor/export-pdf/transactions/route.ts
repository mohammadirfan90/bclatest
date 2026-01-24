/**
 * GET /api/v1/auditor/export-pdf/transactions
 * 
 * Exports transaction report as PDF
 * Query params: from, to (YYYY-MM-DD)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest, withErrorHandler, errorResponse } from '@/lib/api-utils';
import { searchTransactions } from '@/lib/services/transaction-service';
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
    formatDateTime,
    TableColumn,
} from '@/lib/services/pdf-generator';

interface Transaction {
    transactionReference: string;
    type: string;
    sourceAccount: string | null;
    destAccount: string | null;
    amount: number;
    entryDate?: Date;
    createdAt: Date;
    entryType: 'CREDIT' | 'DEBIT' | null;
}

export const GET = withErrorHandler(async (request: NextRequest) => {
    return withAuth(request, async (req: AuthenticatedRequest) => {
        const { searchParams } = new URL(request.url);
        const from = searchParams.get('from');
        const to = searchParams.get('to');

        if (!from || !to) {
            return errorResponse('Both from and to date parameters are required (YYYY-MM-DD)');
        }

        if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
            return errorResponse('Invalid date format. Use YYYY-MM-DD');
        }

        const { transactions, total } = await searchTransactions({
            startDate: from,
            endDate: to,
            limit: 1000,
        });

        const user = req.user!;
        const pdfOptions = {
            title: 'Transaction Report',
            subtitle: `Period: ${from} to ${to}`,
            generatedBy: `${user.firstName} ${user.lastName}`,
            actorId: user.id,
            actorRole: user.roleCode,
        };

        const ctx = await createAuditPDF(pdfOptions);

        drawSectionTitle(ctx, 'Summary');
        drawSummaryRow(ctx, 'Total Transactions:', total.toString());
        drawSummaryRow(ctx, 'Date Range:', `${from} to ${to}`);

        const typedTx = transactions as Transaction[];
        const totalCredits = typedTx.filter(t => t.entryType === 'CREDIT').reduce((sum: number, t) => sum + t.amount, 0);
        const totalDebits = typedTx.filter(t => t.entryType === 'DEBIT').reduce((sum: number, t) => sum + t.amount, 0);
        drawSummaryRow(ctx, 'Total Credits:', formatCurrency(totalCredits));
        drawSummaryRow(ctx, 'Total Debits:', formatCurrency(totalDebits));

        ctx.currentY -= 20;

        drawSectionTitle(ctx, 'Transaction Details');

        const columns: TableColumn[] = [
            { header: 'Reference', width: 80 },
            { header: 'Type', width: 60 },
            { header: 'From', width: 90 },
            { header: 'To', width: 90 },
            { header: 'Amount', width: 80 },
            { header: 'Date', width: 80 },
        ];

        drawTableHeader(ctx, columns);

        for (const tx of typedTx) {
            const values = [
                tx.transactionReference.slice(0, 10),
                tx.type,
                tx.sourceAccount || '-',
                tx.destAccount || '-',
                formatCurrency(tx.amount),
                formatDateTime(tx.createdAt),
            ];

            const success = drawTableRow(ctx, columns, values);
            if (!success) {
                addNewPage(ctx, pdfOptions);
                drawTableHeader(ctx, columns);
                drawTableRow(ctx, columns, values);
            }
        }

        const pdfBytes = await finalizePDF(ctx);

        logPdfExport('TRANSACTIONS', user.id, user.roleCode, { from, to, count: total });

        return new NextResponse(Buffer.from(pdfBytes), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="transactions-${from}-to-${to}.pdf"`,
                'Content-Length': pdfBytes.length.toString(),
            },
        });
    }, { requiredRoles: ['AUDITOR', 'ADMIN'], requiredType: 'user' });
});

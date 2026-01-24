/**
 * GET /api/v1/auditor/export-pdf/ledger
 * 
 * Exports ledger entries as PDF
 * Query params: from, to (YYYY-MM-DD), entryType (optional)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest, withErrorHandler, errorResponse } from '@/lib/api-utils';
import { getAllLedgerEntries } from '@/lib/services/transaction-service';
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
    formatDate,
    TableColumn,
} from '@/lib/services/pdf-generator';

export const GET = withErrorHandler(async (request: NextRequest) => {
    return withAuth(request, async (req: AuthenticatedRequest) => {
        const { searchParams } = new URL(request.url);
        const from = searchParams.get('from');
        const to = searchParams.get('to');
        const entryType = searchParams.get('entryType') as 'DEBIT' | 'CREDIT' | null;

        if (!from || !to) {
            return errorResponse('Both from and to date parameters are required (YYYY-MM-DD)');
        }

        const { entries, total } = await getAllLedgerEntries({
            startDate: new Date(from),
            endDate: new Date(to),
            entryType: entryType || undefined,
            limit: 1000,
        });

        const user = req.user!;
        const pdfOptions = {
            title: 'Ledger Report',
            subtitle: `Period: ${from} to ${to}${entryType ? ` | Type: ${entryType}` : ''}`,
            generatedBy: `${user.firstName} ${user.lastName}`,
            actorId: user.id,
            actorRole: user.roleCode,
        };

        const ctx = await createAuditPDF(pdfOptions);

        drawSectionTitle(ctx, 'Summary');
        drawSummaryRow(ctx, 'Total Entries:', total.toString());

        const totalCredits = entries.filter(e => e.entryType === 'CREDIT').reduce((sum: number, e) => sum + e.amount, 0);
        const totalDebits = entries.filter(e => e.entryType === 'DEBIT').reduce((sum: number, e) => sum + e.amount, 0);
        drawSummaryRow(ctx, 'Total Credits:', formatCurrency(totalCredits));
        drawSummaryRow(ctx, 'Total Debits:', formatCurrency(totalDebits));
        drawSummaryRow(ctx, 'Net Movement:', formatCurrency(totalCredits - totalDebits));

        ctx.currentY -= 20;

        drawSectionTitle(ctx, 'Ledger Entries');

        const columns: TableColumn[] = [
            { header: 'ID', width: 50 },
            { header: 'Account', width: 90 },
            { header: 'Type', width: 50 },
            { header: 'Amount', width: 80 },
            { header: 'Balance After', width: 80 },
            { header: 'Transaction', width: 80 },
            { header: 'Date', width: 70 },
        ];

        drawTableHeader(ctx, columns);

        for (const entry of entries) {
            const values = [
                entry.id.toString(),
                entry.accountNumber,
                entry.entryType,
                formatCurrency(entry.amount),
                formatCurrency(entry.balanceAfter),
                entry.transactionReference.slice(0, 8) + '...',
                formatDate(entry.entryDate),
            ];

            const success = drawTableRow(ctx, columns, values);
            if (!success) {
                addNewPage(ctx, pdfOptions);
                drawTableHeader(ctx, columns);
                drawTableRow(ctx, columns, values);
            }
        }

        const pdfBytes = await finalizePDF(ctx);

        logPdfExport('LEDGER', user.id, user.roleCode, { from, to, entryType, count: total });

        return new NextResponse(Buffer.from(pdfBytes), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="ledger-${from}-to-${to}.pdf"`,
                'Content-Length': pdfBytes.length.toString(),
            },
        });
    }, { requiredRoles: ['AUDITOR', 'ADMIN'], requiredType: 'user' });
});

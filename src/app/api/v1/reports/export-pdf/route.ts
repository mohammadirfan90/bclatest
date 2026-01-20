import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest } from '@/lib/api-utils';
import { withErrorHandler, errorResponse } from '@/lib/api-utils';
import { getDailyTransactionSummary, getDailyTotals } from '@/lib/services/analytics-service';
import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';

export const GET = withErrorHandler(async (request: NextRequest) => {
    return withAuth(request, async (req: AuthenticatedRequest) => {
        const { searchParams } = new URL(request.url);
        const date = searchParams.get('date');

        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return errorResponse('Valid date parameter is required (YYYY-MM-DD)');
        }

        // Get data from ledger
        const summary = await getDailyTransactionSummary(date);
        const { totals: accountTotals } = await getDailyTotals(date, { size: 1000 }); // Get all for report

        // Create PDF (A4 format: 595 x 842 points)
        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        // Helper to add a new A4 page
        let page = pdfDoc.addPage(PageSizes.A4);
        let { width, height } = page.getSize();
        let currentY = height - 50;

        const margin = 50;
        const lineItemHeight = 20;

        // Title
        page.drawText('DAILY TRANSACTION REPORT', {
            x: margin,
            y: currentY,
            size: 18,
            font: boldFont,
            color: rgb(0, 0, 0),
        });
        currentY -= 30;

        page.drawText(`Date: ${date}`, {
            x: margin,
            y: currentY,
            size: 11,
            font,
        });
        currentY -= 40;

        // --- System Summary Section ---
        page.drawText('SYSTEM SUMMARY', {
            x: margin,
            y: currentY,
            size: 12,
            font: boldFont,
        });
        currentY -= 10;
        page.drawLine({
            start: { x: margin, y: currentY },
            end: { x: width - margin, y: currentY },
            thickness: 1,
            color: rgb(0, 0, 0)
        });
        currentY -= 20;

        const drawSummaryRow = (label: string, value: string) => {
            page.drawText(label, { x: margin, y: currentY, size: 10, font });
            page.drawText(value, { x: margin + 150, y: currentY, size: 10, font: boldFont });
            currentY -= 15;
        };

        drawSummaryRow('Total Deposits:', `BDT ${summary.totalDeposits.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
        drawSummaryRow('Total Withdrawals:', `BDT ${summary.totalWithdrawals.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
        drawSummaryRow('Transaction Count:', summary.transactionCount.toString());
        drawSummaryRow('Total Volume:', `BDT ${summary.volume.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);

        currentY -= 30;

        // --- Account Table Section ---
        page.drawText('ACCOUNT DAILY TOTALS', {
            x: margin,
            y: currentY,
            size: 12,
            font: boldFont,
        });
        currentY -= 10;
        page.drawLine({
            start: { x: margin, y: currentY },
            end: { x: width - margin, y: currentY },
            thickness: 1,
            color: rgb(0, 0, 0)
        });
        currentY -= 20;

        // Table Header
        const cols = {
            acc: margin,
            cust: margin + 120,
            open: margin + 250,
            cred: margin + 320,
            deb: margin + 390,
            clos: margin + 460
        };

        const drawTableHeader = (y: number) => {
            const headerSize = 9;
            page.drawText('Account', { x: cols.acc, y, size: headerSize, font: boldFont });
            page.drawText('Customer', { x: cols.cust, y, size: headerSize, font: boldFont });
            page.drawText('Opening', { x: cols.open, y, size: headerSize, font: boldFont });
            page.drawText('Credits', { x: cols.cred, y, size: headerSize, font: boldFont });
            page.drawText('Debits', { x: cols.deb, y, size: headerSize, font: boldFont });
            page.drawText('Closing', { x: cols.clos, y, size: headerSize, font: boldFont });
        };

        drawTableHeader(currentY);
        currentY -= 15;
        page.drawLine({
            start: { x: margin, y: currentY },
            end: { x: width - margin, y: currentY },
            thickness: 0.5,
            color: rgb(0, 0, 0)
        });
        currentY -= 15;

        // Rows
        for (const account of accountTotals) {
            // Check for page overflow
            if (currentY < 70) {
                page = pdfDoc.addPage(PageSizes.A4);
                currentY = height - 50;
                drawTableHeader(currentY);
                currentY -= 15;
                page.drawLine({
                    start: { x: margin, y: currentY },
                    end: { x: width - margin, y: currentY },
                    thickness: 0.5,
                    color: rgb(0, 0, 0)
                });
                currentY -= 15;
            }

            const rowSize = 8;
            page.drawText(account.accountNumber, { x: cols.acc, y: currentY, size: rowSize, font });
            page.drawText(account.customerName.substring(0, 25), { x: cols.cust, y: currentY, size: rowSize, font });
            page.drawText(account.openingBalance.toLocaleString(undefined, { minimumFractionDigits: 1 }), { x: cols.open, y: currentY, size: rowSize, font });
            page.drawText(account.totalCredits.toLocaleString(undefined, { minimumFractionDigits: 1 }), { x: cols.cred, y: currentY, size: rowSize, font });
            page.drawText(account.totalDebits.toLocaleString(undefined, { minimumFractionDigits: 1 }), { x: cols.deb, y: currentY, size: rowSize, font });
            page.drawText(account.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 1 }), { x: cols.clos, y: currentY, size: rowSize, font });

            currentY -= 15;
        }

        // Footer
        const pages = pdfDoc.getPages();
        for (let i = 0; i < pages.length; i++) {
            const p = pages[i];
            p.drawText(`Page ${i + 1} of ${pages.length} | Generated on ${new Date().toLocaleDateString()}`, {
                x: margin,
                y: 30,
                size: 8,
                font,
                color: rgb(0.3, 0.3, 0.3),
            });
        }

        const pdfBytes = await pdfDoc.save();

        return new NextResponse(Buffer.from(pdfBytes), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="daily-report-${date}.pdf"`,
                'Content-Length': pdfBytes.length.toString(),
            },
        });
    }, { requiredRoles: ['BANKER', 'ADMIN'], hideFailure: true });
});

import { query, queryOne } from '../db';
import { RowDataPacket } from 'mysql2/promise';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
// =============================================================================
// Types
// =============================================================================

export interface StatementEntry {
    id: number;
    date: Date;
    description: string | null;
    debit: number | null;
    credit: number | null;
    runningBalance: number;
    transactionReference: string;
    transactionType: string;
}

export interface AccountStatement {
    account: {
        id: number;
        accountNumber: string;
        accountType: string;
        customerName: string;
    };
    period: {
        from: string;
        to: string;
    };
    openingBalance: number;
    closingBalance: number;
    totalDebits: number;
    totalCredits: number;
    entries: StatementEntry[];
}

export interface StatementOptions {
    from: string; // YYYY-MM-DD
    to: string;   // YYYY-MM-DD
    page?: number;
    size?: number;
}

export interface TransactionSearchFilters {
    from?: string;
    to?: string;
    amountMin?: number;
    amountMax?: number;
    entryType?: 'DEBIT' | 'CREDIT';
    transactionType?: string;
    reference?: string;
    accountId?: number;
    includeReversals?: boolean;
    page?: number;
    size?: number;
}

export interface SearchResult {
    id: number;
    transactionReference: string;
    transactionType: string;
    accountId: number;
    accountNumber: string;
    entryType: 'DEBIT' | 'CREDIT';
    amount: number;
    balanceAfter: number;
    description: string | null;
    entryDate: Date;
    createdAt: Date;
    isReversal: boolean;
}

// =============================================================================
// Statement Generation
// =============================================================================

interface LedgerRow extends RowDataPacket {
    id: number;
    transaction_id: number;
    account_id: number;
    entry_type: 'DEBIT' | 'CREDIT';
    amount: string;
    currency: string;
    balance_after: string;
    description: string | null;
    entry_date: Date;
    created_at: Date;
    transaction_reference: string;
    transaction_type: string;
}

interface AccountRow extends RowDataPacket {
    id: number;
    account_number: string;
    account_type_name: string;
    customer_name: string;
}

interface BalanceRow extends RowDataPacket {
    total_credits: string;
    total_debits: string;
}

export async function getAccountStatement(
    accountId: number,
    options: StatementOptions
): Promise<{ statement: AccountStatement; total: number }> {
    const { from, to, page = 1, size = 50 } = options;
    const offset = (page - 1) * size;

    // Get account info
    const account = await queryOne<AccountRow>(
        `SELECT a.id, a.account_number, at.name as account_type_name,
                CONCAT(c.first_name, ' ', c.last_name) as customer_name
         FROM accounts a
         JOIN customers c ON a.customer_id = c.id
         JOIN account_types at ON at.id = a.account_type_id
         WHERE a.id = ?`,
        [accountId]
    );

    if (!account) {
        throw new Error('Account not found');
    }

    // Calculate opening balance (sum of all entries before the period start)
    const openingBalanceRow = await queryOne<BalanceRow>(
        `SELECT 
            COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0) as total_credits,
            COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END), 0) as total_debits
         FROM ledger_entries
         WHERE account_id = ? AND entry_date < ?`,
        [accountId, from]
    );

    const openingBalance =
        parseFloat(openingBalanceRow?.total_credits || '0') -
        parseFloat(openingBalanceRow?.total_debits || '0');

    // Get total count of entries in period
    interface CountRow extends RowDataPacket {
        count: number;
    }
    const countRow = await queryOne<CountRow>(
        `SELECT COUNT(*) as count
         FROM ledger_entries le
         WHERE le.account_id = ? AND le.entry_date >= ? AND le.entry_date <= ?`,
        [accountId, from, to]
    );
    const total = countRow?.count || 0;

    // Get period totals for closing balance calculation
    const periodTotals = await queryOne<BalanceRow>(
        `SELECT 
            COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0) as total_credits,
            COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END), 0) as total_debits
         FROM ledger_entries
         WHERE account_id = ? AND entry_date >= ? AND entry_date <= ?`,
        [accountId, from, to]
    );

    const totalCredits = parseFloat(periodTotals?.total_credits || '0');
    const totalDebits = parseFloat(periodTotals?.total_debits || '0');
    const closingBalance = openingBalance + totalCredits - totalDebits;

    // Get ledger entries for period (ordered by created_at ASC for running balance)
    const rows = await query<LedgerRow[]>(
        `SELECT le.id, le.transaction_id, le.account_id, le.entry_type, 
                le.amount, le.currency, le.balance_after, le.description,
                le.entry_date, le.created_at, t.transaction_reference,
                tt.code as transaction_type
         FROM ledger_entries le
         JOIN transactions t ON le.transaction_id = t.id
         JOIN transaction_types tt ON t.transaction_type_id = tt.id
         WHERE le.account_id = ? AND le.entry_date >= ? AND le.entry_date <= ?
         ORDER BY le.created_at ASC, le.id ASC
         LIMIT ? OFFSET ?`,
        [accountId, from, to, size, offset]
    );

    // Compute running balance for paginated entries
    // For running balance, we need to know the balance at the start of this page
    let runningBalance = openingBalance;

    // If we're not on page 1, calculate the balance up to this page
    if (page > 1) {
        const previousTotals = await queryOne<BalanceRow>(
            `SELECT 
                COALESCE(SUM(CASE WHEN entry_type = 'CREDIT' THEN amount ELSE 0 END), 0) as total_credits,
                COALESCE(SUM(CASE WHEN entry_type = 'DEBIT' THEN amount ELSE 0 END), 0) as total_debits
             FROM (
                SELECT entry_type, amount
                FROM ledger_entries
                WHERE account_id = ? AND entry_date >= ? AND entry_date <= ?
                ORDER BY created_at ASC, id ASC
                LIMIT ?
             ) as previous_entries`,
            [accountId, from, to, offset]
        );
        runningBalance = openingBalance +
            parseFloat(previousTotals?.total_credits || '0') -
            parseFloat(previousTotals?.total_debits || '0');
    }

    const entries: StatementEntry[] = rows.map((row) => {
        const amount = parseFloat(row.amount);
        if (row.entry_type === 'CREDIT') {
            runningBalance += amount;
        } else {
            runningBalance -= amount;
        }

        return {
            id: row.id,
            date: row.entry_date,
            description: row.description,
            debit: row.entry_type === 'DEBIT' ? amount : null,
            credit: row.entry_type === 'CREDIT' ? amount : null,
            runningBalance: Math.round(runningBalance * 100) / 100, // Round to 2 decimal places
            transactionReference: row.transaction_reference,
            transactionType: row.transaction_type,
        };
    });

    return {
        statement: {
            account: {
                id: account.id,
                accountNumber: account.account_number,
                accountType: account.account_type_name,
                customerName: account.customer_name,
            },
            period: { from, to },
            openingBalance: Math.round(openingBalance * 100) / 100,
            closingBalance: Math.round(closingBalance * 100) / 100,
            totalDebits: Math.round(totalDebits * 100) / 100,
            totalCredits: Math.round(totalCredits * 100) / 100,
            entries,
        },
        total,
    };
}

// =============================================================================
// Helpers
// =============================================================================

function maskAccountNumber(accountNumber: string): string {
    if (accountNumber.length <= 4) return accountNumber;
    return '****' + accountNumber.slice(-4);
}

function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-BD', {
        style: 'currency',
        currency: 'BDT',
        minimumFractionDigits: 2,
    }).format(amount);
}

function formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(new Date(date));
}

// =============================================================================
// PDF Generation
// =============================================================================

export async function generateStatementPdf(
    accountId: number,
    from: string, // YYYY-MM-DD
    to: string     // YYYY-MM-DD
): Promise<Buffer> {
    // Get all entries for the date range
    const { statement } = await getAccountStatement(accountId, {
        from,
        to,
        page: 1,
        size: 10000,
    });

    // Create a new PDFDocument
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let page = pdfDoc.addPage([595.28, 841.89]); // A4
    const { width, height } = page.getSize();
    const margin = 50;

    let y = height - margin;

    // Helper to add new page
    const addNewPage = () => {
        page = pdfDoc.addPage([595.28, 841.89]);
        y = height - margin;
        return page;
    };

    // Helper to draw text
    const drawText = (text: string, x: number, currentY: number, size = 10, f = font, color = rgb(0, 0, 0)) => {
        page.drawText(text, {
            x,
            y: currentY,
            size,
            font: f,
            color,
        });
    };

    // Simple Black & White Design
    const primaryColor = rgb(0, 0, 0);
    const secondaryColor = rgb(0.3, 0.3, 0.3);

    // Header
    const title = 'BNKCORE';
    const titleWidth = fontBold.widthOfTextAtSize(title, 22);
    drawText(title, (width - titleWidth) / 2, y, 22, fontBold);
    y -= 25;

    const subtitle = 'Core Banking System';
    const subtitleWidth = font.widthOfTextAtSize(subtitle, 10);
    drawText(subtitle, (width - subtitleWidth) / 2, y, 10, font);
    y -= 35;

    const reportTitle = 'Account Statement';
    const reportTitleWidth = fontBold.widthOfTextAtSize(reportTitle, 16);
    drawText(reportTitle, (width - reportTitleWidth) / 2, y, 16, fontBold);
    y -= 45;

    // Account Information
    const infoY = y;
    drawText('Account Holder:', margin, y, 10, fontBold);
    drawText(statement.account.customerName, margin + 90, y, 10, font);
    y -= 18;
    drawText('Account Number:', margin, y, 10, fontBold);
    // Display full account number
    drawText(statement.account.accountNumber, margin + 90, y, 10, font);
    y -= 18;
    drawText('Account Type:', margin, y, 10, fontBold);
    drawText(statement.account.accountType, margin + 90, y, 10, font);

    drawText('Statement Period:', 320, infoY, 10, fontBold);
    drawText(`${formatDate(new Date(from))} - ${formatDate(new Date(to))}`, 410, infoY, 10, font);
    drawText('Generated:', 320, infoY - 18, 10, fontBold);
    drawText(formatDate(new Date()), 410, infoY - 18, 10, font);

    y -= 50;

    // Summary Box
    page.drawRectangle({
        x: margin,
        y: y - 55,
        width: width - 2 * margin,
        height: 65,
        borderColor: rgb(0, 0, 0),
        borderWidth: 1,
    });

    const summaryY1 = y - 20;
    const summaryY2 = y - 45;

    drawText('Opening Balance:', margin + 15, summaryY1, 10, fontBold);
    drawText(formatCurrency(statement.openingBalance), margin + 110, summaryY1, 10, fontBold);

    drawText('Total Credits:', margin + 260, summaryY1, 10, fontBold);
    drawText(formatCurrency(statement.totalCredits), margin + 350, summaryY1, 10, fontBold);

    drawText('Closing Balance:', margin + 15, summaryY2, 10, fontBold);
    drawText(formatCurrency(statement.closingBalance), margin + 110, summaryY2, 10, fontBold);

    drawText('Total Debits:', margin + 260, summaryY2, 10, fontBold);
    drawText(formatCurrency(statement.totalDebits), margin + 350, summaryY2, 10, fontBold);

    y -= 90;

    // Table Column Definitions
    const colDate = margin;
    const colDesc = margin + 75;
    const colDebit = margin + 250;
    const colCredit = margin + 330;
    const colBalance = margin + 415;
    const colWidths = { debit: 70, credit: 70, balance: 80 };

    const drawTableHeader = (currentY: number) => {
        page.drawRectangle({
            x: margin,
            y: currentY - 18,
            width: width - 2 * margin,
            height: 25,
            color: rgb(0.9, 0.9, 0.9),
        });
        const headerTextY = currentY - 3;
        drawText('Date', colDate + 5, headerTextY, 9, fontBold);
        drawText('Description', colDesc, headerTextY, 9, fontBold);

        const drawRightText = (text: string, x: number, targetWidth: number, currentYInner: number, size = 9, f = fontBold) => {
            const textWidth = f.widthOfTextAtSize(text, size);
            drawText(text, x + targetWidth - textWidth - 5, currentYInner, size, f);
        };

        drawRightText('Debit', colDebit, colWidths.debit, headerTextY);
        drawRightText('Credit', colCredit, colWidths.credit, headerTextY);
        drawRightText('Balance', colBalance, colWidths.balance, headerTextY);
    };

    drawTableHeader(y);
    y -= 30;

    const drawRowRightText = (text: string, x: number, targetWidth: number, currentY: number, size = 8, f = font) => {
        const textWidth = f.widthOfTextAtSize(text, size);
        drawText(text, x + targetWidth - textWidth - 5, currentY, size, f);
    };

    // Opening Balance Row
    drawText(formatDate(new Date(from)), colDate + 5, y, 8, fontBold);
    drawText('Opening Balance', colDesc, y, 8, fontBold);
    drawRowRightText(formatCurrency(statement.openingBalance), colBalance, colWidths.balance, y, 8, fontBold);
    y -= 18;

    // Transaction rows
    for (const entry of statement.entries) {
        if (y < margin + 60) {
            addNewPage();
            drawTableHeader(y);
            y -= 30;
        }

        const index = statement.entries.indexOf(entry);
        if (index % 2 === 1) {
            page.drawRectangle({
                x: margin,
                y: y - 5,
                width: width - 2 * margin,
                height: 18,
                color: rgb(0.98, 0.98, 0.98),
            });
        }

        drawText(formatDate(entry.date), colDate + 5, y, 8, font, secondaryColor);
        const desc = entry.description || entry.transactionType;
        drawText(desc.length > 35 ? desc.substring(0, 32) + '...' : desc, colDesc, y, 8, font);

        if (entry.debit) {
            drawRowRightText(formatCurrency(entry.debit), colDebit, colWidths.debit, y, 8, font);
        }
        if (entry.credit) {
            drawRowRightText(formatCurrency(entry.credit), colCredit, colWidths.credit, y, 8, font);
        }

        drawRowRightText(formatCurrency(entry.runningBalance), colBalance, colWidths.balance, y, 8, font);

        y -= 18;
    }

    // Closing Balance Row
    if (y < margin + 40) {
        addNewPage();
        drawTableHeader(y);
        y -= 30;
    }
    y -= 5;
    drawText(formatDate(new Date(to)), colDate + 5, y, 8, fontBold);
    drawText('Closing Balance', colDesc, y, 8, fontBold);
    drawRowRightText(formatCurrency(statement.closingBalance), colBalance, colWidths.balance, y, 8, fontBold);

    // Footer
    const pages = pdfDoc.getPages();
    for (let i = 0; i < pages.length; i++) {
        const p = pages[i];
        const footerText = `Page ${i + 1} of ${pages.length} | This is a computer-generated document and does not require signature.`;
        const footerWidth = font.widthOfTextAtSize(footerText, 8);
        p.drawText(footerText, {
            x: (width - footerWidth) / 2,
            y: 30,
            size: 8,
            font: font,
            color: rgb(0, 0, 0),
        });
    }

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
}

// =============================================================================
// Transaction Search (Banker/Admin)
// =============================================================================

interface SearchRow extends RowDataPacket {
    id: number;
    transaction_reference: string;
    transaction_type: string;
    account_id: number;
    account_number: string;
    entry_type: 'DEBIT' | 'CREDIT';
    amount: string;
    balance_after: string;
    description: string | null;
    entry_date: Date;
    created_at: Date;
    is_reversal: boolean;
}

export async function searchTransactions(
    filters: TransactionSearchFilters
): Promise<{ results: SearchResult[]; total: number }> {
    const {
        from,
        to,
        amountMin,
        amountMax,
        entryType,
        transactionType,
        reference,
        accountId,
        includeReversals = true,
        page = 1,
        size = 50,
    } = filters;

    const offset = (page - 1) * size;
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];

    if (from) {
        conditions.push('le.entry_date >= ?');
        params.push(from);
    }

    if (to) {
        conditions.push('le.entry_date <= ?');
        params.push(to);
    }

    if (amountMin !== undefined) {
        conditions.push('le.amount >= ?');
        params.push(amountMin);
    }

    if (amountMax !== undefined) {
        conditions.push('le.amount <= ?');
        params.push(amountMax);
    }

    if (entryType) {
        conditions.push('le.entry_type = ?');
        params.push(entryType);
    }

    if (transactionType) {
        conditions.push('tt.code = ?');
        params.push(transactionType);
    }

    if (reference) {
        conditions.push('(t.transaction_reference LIKE ? OR le.description LIKE ?)');
        params.push(`%${reference}%`, `%${reference}%`);
    }

    if (accountId) {
        conditions.push('le.account_id = ?');
        params.push(accountId);
    }

    if (!includeReversals) {
        conditions.push("t.status != 'REVERSED'");
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    interface CountRow extends RowDataPacket {
        count: number;
    }
    const countRow = await queryOne<CountRow>(
        `SELECT COUNT(*) as count
         FROM ledger_entries le
         JOIN transactions t ON le.transaction_id = t.id
         JOIN transaction_types tt ON t.transaction_type_id = tt.id
         JOIN accounts a ON le.account_id = a.id
         WHERE ${whereClause}`,
        params
    );

    // Get results
    const rows = await query<SearchRow[]>(
        `SELECT le.id, t.transaction_reference, tt.code as transaction_type,
                le.account_id, a.account_number, le.entry_type, le.amount,
                le.balance_after, le.description, le.entry_date, le.created_at,
                (t.status = 'REVERSED') as is_reversal
         FROM ledger_entries le
         JOIN transactions t ON le.transaction_id = t.id
         JOIN transaction_types tt ON t.transaction_type_id = tt.id
         JOIN accounts a ON le.account_id = a.id
         WHERE ${whereClause}
         ORDER BY le.created_at DESC, le.id DESC
         LIMIT ? OFFSET ?`,
        [...params, size, offset]
    );

    const results: SearchResult[] = rows.map((row) => ({
        id: row.id,
        transactionReference: row.transaction_reference,
        transactionType: row.transaction_type,
        accountId: row.account_id,
        accountNumber: row.account_number,
        entryType: row.entry_type,
        amount: parseFloat(row.amount),
        balanceAfter: parseFloat(row.balance_after),
        description: row.description,
        entryDate: row.entry_date,
        createdAt: row.created_at,
        isReversal: Boolean(row.is_reversal),
    }));

    return { results, total: countRow?.count || 0 };
}

// =============================================================================
// CSV Export Helper
// =============================================================================

export function generateCsvFromResults(results: SearchResult[]): string {
    const headers = [
        'ID',
        'Date',
        'Transaction Ref',
        'Type',
        'Account Number',
        'Entry Type',
        'Amount',
        'Balance After',
        'Description',
        'Is Reversal',
    ];

    const rows = results.map((r) => [
        r.id,
        formatDate(r.entryDate),
        r.transactionReference,
        r.transactionType,
        r.accountNumber,
        r.entryType,
        r.amount.toFixed(2),
        r.balanceAfter.toFixed(2),
        `"${(r.description || '').replace(/"/g, '""')}"`,
        r.isReversal ? 'Yes' : 'No',
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

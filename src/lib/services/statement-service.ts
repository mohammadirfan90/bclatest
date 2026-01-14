import { query, queryOne } from '../db';
import { RowDataPacket } from 'mysql2/promise';
import PDFDocument from 'pdfkit';
import { Readable } from 'stream';

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
// PDF Generation
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

export async function generateStatementPdf(
    accountId: number,
    month: string // YYYY-MM format
): Promise<Buffer> {
    // Parse month to get first and last day
    const [year, monthNum] = month.split('-').map(Number);
    const from = `${year}-${String(monthNum).padStart(2, '0')}-01`;
    const lastDay = new Date(year, monthNum, 0).getDate();
    const to = `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    // Get all entries for the month (no pagination for PDF)
    const { statement } = await getAccountStatement(accountId, {
        from,
        to,
        page: 1,
        size: 10000, // Get all entries for PDF
    });

    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        const doc = new PDFDocument({
            size: 'A4',
            margin: 50,
            bufferPages: true
        });

        doc.on('data', (chunk: Buffer) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header
        doc.fontSize(20).font('Helvetica-Bold').text('BNKCORE', { align: 'center' });
        doc.fontSize(10).font('Helvetica').text('Core Banking System', { align: 'center' });
        doc.moveDown(0.5);
        doc.fontSize(14).font('Helvetica-Bold').text('Account Statement', { align: 'center' });
        doc.moveDown();

        // Account Information
        doc.fontSize(10).font('Helvetica');
        const infoY = doc.y;

        doc.text(`Account Holder: ${statement.account.customerName}`, 50, infoY);
        doc.text(`Account Number: ${maskAccountNumber(statement.account.accountNumber)}`, 50);
        doc.text(`Account Type: ${statement.account.accountType}`, 50);

        doc.text(`Statement Period: ${formatDate(new Date(from))} - ${formatDate(new Date(to))}`, 300, infoY);
        doc.text(`Generated: ${formatDate(new Date())}`, 300);

        doc.moveDown(2);

        // Summary Box
        const summaryY = doc.y;
        doc.rect(50, summaryY, 495, 60).stroke();

        doc.font('Helvetica-Bold').text('Opening Balance:', 60, summaryY + 10);
        doc.font('Helvetica').text(formatCurrency(statement.openingBalance), 180, summaryY + 10);

        doc.font('Helvetica-Bold').text('Total Credits:', 300, summaryY + 10);
        doc.font('Helvetica').text(formatCurrency(statement.totalCredits), 400, summaryY + 10);

        doc.font('Helvetica-Bold').text('Closing Balance:', 60, summaryY + 35);
        doc.font('Helvetica').text(formatCurrency(statement.closingBalance), 180, summaryY + 35);

        doc.font('Helvetica-Bold').text('Total Debits:', 300, summaryY + 35);
        doc.font('Helvetica').text(formatCurrency(statement.totalDebits), 400, summaryY + 35);

        doc.y = summaryY + 80;

        // Table Header
        const tableTop = doc.y;
        const colDate = 50;
        const colDesc = 120;
        const colDebit = 300;
        const colCredit = 380;
        const colBalance = 460;

        doc.font('Helvetica-Bold').fontSize(9);
        doc.rect(50, tableTop, 495, 20).fill('#f0f0f0');
        doc.fillColor('#000000');
        doc.text('Date', colDate, tableTop + 6);
        doc.text('Description', colDesc, tableTop + 6);
        doc.text('Debit', colDebit, tableTop + 6, { width: 70, align: 'right' });
        doc.text('Credit', colCredit, tableTop + 6, { width: 70, align: 'right' });
        doc.text('Balance', colBalance, tableTop + 6, { width: 80, align: 'right' });

        let y = tableTop + 25;
        doc.font('Helvetica').fontSize(8);

        // Opening balance row
        doc.text(formatDate(new Date(from)), colDate, y);
        doc.text('Opening Balance', colDesc, y);
        doc.text('', colDebit, y, { width: 70, align: 'right' });
        doc.text('', colCredit, y, { width: 70, align: 'right' });
        doc.text(formatCurrency(statement.openingBalance), colBalance, y, { width: 80, align: 'right' });
        y += 15;

        // Transaction rows
        for (const entry of statement.entries) {
            // Check if we need a new page
            if (y > 750) {
                doc.addPage();
                y = 50;

                // Repeat header on new page
                doc.font('Helvetica-Bold').fontSize(9);
                doc.rect(50, y, 495, 20).fill('#f0f0f0');
                doc.fillColor('#000000');
                doc.text('Date', colDate, y + 6);
                doc.text('Description', colDesc, y + 6);
                doc.text('Debit', colDebit, y + 6, { width: 70, align: 'right' });
                doc.text('Credit', colCredit, y + 6, { width: 70, align: 'right' });
                doc.text('Balance', colBalance, y + 6, { width: 80, align: 'right' });
                y += 25;
                doc.font('Helvetica').fontSize(8);
            }

            // Alternate row background
            if (statement.entries.indexOf(entry) % 2 === 1) {
                doc.rect(50, y - 3, 495, 15).fill('#fafafa');
                doc.fillColor('#000000');
            }

            doc.text(formatDate(entry.date), colDate, y);
            const desc = entry.description || entry.transactionType;
            doc.text(desc.length > 30 ? desc.substring(0, 27) + '...' : desc, colDesc, y);
            doc.text(entry.debit ? formatCurrency(entry.debit) : '', colDebit, y, { width: 70, align: 'right' });
            doc.text(entry.credit ? formatCurrency(entry.credit) : '', colCredit, y, { width: 70, align: 'right' });
            doc.text(formatCurrency(entry.runningBalance), colBalance, y, { width: 80, align: 'right' });

            y += 15;
        }

        // Closing balance row
        doc.font('Helvetica-Bold');
        doc.text(formatDate(new Date(to)), colDate, y + 5);
        doc.text('Closing Balance', colDesc, y + 5);
        doc.text('', colDebit, y + 5, { width: 70, align: 'right' });
        doc.text('', colCredit, y + 5, { width: 70, align: 'right' });
        doc.text(formatCurrency(statement.closingBalance), colBalance, y + 5, { width: 80, align: 'right' });

        // Footer
        const pageCount = doc.bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
            doc.switchToPage(i);
            doc.fontSize(8).font('Helvetica');
            doc.text(
                `Page ${i + 1} of ${pageCount} | This is a computer-generated document and does not require signature.`,
                50,
                doc.page.height - 50,
                { align: 'center', width: 495 }
            );
        }

        doc.end();
    });
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

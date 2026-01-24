/**
 * PDF Generator Service
 * Provides reusable PDF generation utilities for audit reports
 */

import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont, PageSizes, degrees } from 'pdf-lib';
import { logAuditEventAsync } from './audit-service';

// =============================================================================
// Types
// =============================================================================

export interface PDFGeneratorOptions {
    title: string;
    subtitle?: string;
    generatedBy?: string;
    actorId?: number;
    actorRole?: string;
}

export interface TableColumn {
    header: string;
    width: number;
    align?: 'left' | 'right' | 'center';
}

export interface PDFContext {
    doc: PDFDocument;
    page: PDFPage;
    font: PDFFont;
    boldFont: PDFFont;
    width: number;
    height: number;
    margin: number;
    currentY: number;
}

// =============================================================================
// Constants
// =============================================================================

const WATERMARK_TEXT = 'Banking Core – Audit Copy';
const WATERMARK_OPACITY = 0.08;
const MARGIN = 50;
const LINE_HEIGHT = 15;
const HEADER_HEIGHT = 80;
const FOOTER_HEIGHT = 40;

// =============================================================================
// PDF Document Creation
// =============================================================================

/**
 * Creates a new PDF document with standard setup
 */
export async function createAuditPDF(options: PDFGeneratorOptions): Promise<PDFContext> {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

    const page = doc.addPage(PageSizes.A4);
    const { width, height } = page.getSize();

    const ctx: PDFContext = {
        doc,
        page,
        font,
        boldFont,
        width,
        height,
        margin: MARGIN,
        currentY: height - MARGIN,
    };

    // Draw header
    drawHeader(ctx, options);

    // Add watermark
    addWatermark(ctx);

    return ctx;
}

/**
 * Draws the standard header on a page
 */
function drawHeader(ctx: PDFContext, options: PDFGeneratorOptions): void {
    const { page, boldFont, font, margin, width } = ctx;
    let y = ctx.height - margin;

    // Title
    page.drawText(options.title.toUpperCase(), {
        x: margin,
        y,
        size: 16,
        font: boldFont,
        color: rgb(0.1, 0.1, 0.1),
    });
    y -= 20;

    // Subtitle
    if (options.subtitle) {
        page.drawText(options.subtitle, {
            x: margin,
            y,
            size: 10,
            font,
            color: rgb(0.3, 0.3, 0.3),
        });
        y -= 15;
    }

    // Generation info
    const timestamp = new Date().toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
    page.drawText(`Generated: ${timestamp}`, {
        x: margin,
        y,
        size: 9,
        font,
        color: rgb(0.4, 0.4, 0.4),
    });

    if (options.generatedBy) {
        page.drawText(`By: ${options.generatedBy}`, {
            x: width - margin - 150,
            y,
            size: 9,
            font,
            color: rgb(0.4, 0.4, 0.4),
        });
    }
    y -= 10;

    // Header line
    page.drawLine({
        start: { x: margin, y },
        end: { x: width - margin, y },
        thickness: 1,
        color: rgb(0.2, 0.2, 0.2),
    });

    ctx.currentY = y - 20;
}

/**
 * Adds diagonal watermark across the page
 */
function addWatermark(ctx: PDFContext): void {
    const { page, boldFont, width, height } = ctx;

    // Draw diagonal watermark text
    page.drawText(WATERMARK_TEXT, {
        x: width / 2 - 120,
        y: height / 2,
        size: 40,
        font: boldFont,
        color: rgb(0.5, 0.5, 0.5),
        opacity: WATERMARK_OPACITY,
        rotate: degrees(45),
    });
}

/**
 * Adds a new page with header and watermark
 */
export function addNewPage(ctx: PDFContext, options: PDFGeneratorOptions): void {
    ctx.page = ctx.doc.addPage(PageSizes.A4);
    ctx.currentY = ctx.height - ctx.margin;
    drawHeader(ctx, options);
    addWatermark(ctx);
}

// =============================================================================
// Table Drawing
// =============================================================================

/**
 * Draws a table header row
 */
export function drawTableHeader(
    ctx: PDFContext,
    columns: TableColumn[],
    startX: number = ctx.margin
): void {
    const { page, boldFont, margin, width } = ctx;
    let x = startX;

    for (const col of columns) {
        page.drawText(col.header, {
            x,
            y: ctx.currentY,
            size: 9,
            font: boldFont,
            color: rgb(0.1, 0.1, 0.1),
        });
        x += col.width;
    }

    ctx.currentY -= 12;

    // Underline
    page.drawLine({
        start: { x: margin, y: ctx.currentY },
        end: { x: width - margin, y: ctx.currentY },
        thickness: 0.5,
        color: rgb(0.3, 0.3, 0.3),
    });

    ctx.currentY -= 10;
}

/**
 * Draws a table row
 */
export function drawTableRow(
    ctx: PDFContext,
    columns: TableColumn[],
    values: string[],
    startX: number = ctx.margin
): boolean {
    const { page, font, margin, width, height } = ctx;

    // Check if we need a new page
    if (ctx.currentY < FOOTER_HEIGHT + 20) {
        return false; // Signal that a new page is needed
    }

    let x = startX;
    for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        const value = values[i] || '';
        const truncated = value.length > 30 ? value.substring(0, 28) + '...' : value;

        page.drawText(truncated, {
            x,
            y: ctx.currentY,
            size: 8,
            font,
            color: rgb(0.2, 0.2, 0.2),
        });
        x += col.width;
    }

    ctx.currentY -= LINE_HEIGHT;
    return true;
}

/**
 * Draws a section title
 */
export function drawSectionTitle(ctx: PDFContext, title: string): void {
    const { page, boldFont, margin, width } = ctx;

    ctx.currentY -= 10;

    page.drawText(title, {
        x: margin,
        y: ctx.currentY,
        size: 11,
        font: boldFont,
        color: rgb(0.1, 0.1, 0.1),
    });

    ctx.currentY -= 8;

    page.drawLine({
        start: { x: margin, y: ctx.currentY },
        end: { x: width - margin, y: ctx.currentY },
        thickness: 0.5,
        color: rgb(0.4, 0.4, 0.4),
    });

    ctx.currentY -= 15;
}

/**
 * Draws a key-value summary row
 */
export function drawSummaryRow(ctx: PDFContext, label: string, value: string): void {
    const { page, font, boldFont, margin } = ctx;

    page.drawText(label, {
        x: margin,
        y: ctx.currentY,
        size: 10,
        font,
        color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText(value, {
        x: margin + 150,
        y: ctx.currentY,
        size: 10,
        font: boldFont,
        color: rgb(0.1, 0.1, 0.1),
    });

    ctx.currentY -= LINE_HEIGHT;
}

// =============================================================================
// Finalization
// =============================================================================

/**
 * Adds page numbers and footers to all pages
 */
export function addFooters(ctx: PDFContext): void {
    const pages = ctx.doc.getPages();
    const totalPages = pages.length;

    for (let i = 0; i < totalPages; i++) {
        const page = pages[i];
        const { width } = page.getSize();

        // Page number
        page.drawText(`Page ${i + 1} of ${totalPages}`, {
            x: width - ctx.margin - 60,
            y: 25,
            size: 8,
            font: ctx.font,
            color: rgb(0.4, 0.4, 0.4),
        });

        // Footer watermark
        page.drawText('CONFIDENTIAL – FOR AUDIT PURPOSES ONLY', {
            x: ctx.margin,
            y: 25,
            size: 7,
            font: ctx.font,
            color: rgb(0.5, 0.5, 0.5),
        });
    }
}

/**
 * Finalizes the PDF and returns bytes
 */
export async function finalizePDF(ctx: PDFContext): Promise<Uint8Array> {
    addFooters(ctx);
    return await ctx.doc.save();
}

// =============================================================================
// Audit Logging
// =============================================================================

/**
 * Logs a PDF export event
 */
export function logPdfExport(
    reportType: string,
    actorId: number | null,
    actorRole: string | null,
    metadata?: Record<string, unknown>
): void {
    logAuditEventAsync({
        actorId,
        actorType: 'user',
        actorRole,
        actionType: 'PDF_EXPORTED',
        entityType: 'REPORT',
        entityId: null,
        metadata: {
            reportType,
            exportedAt: new Date().toISOString(),
            ...metadata,
        },
    });
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Formats currency for PDF display
 */
export function formatCurrency(amount: number, currency: string = 'BDT'): string {
    return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
}

/**
 * Formats date for PDF display
 */
export function formatDate(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

/**
 * Formats datetime for PDF display
 */
export function formatDateTime(date: Date | string): string {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

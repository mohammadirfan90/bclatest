/**
 * GET /api/v1/auditor/export-pdf/audit-logs
 * 
 * Exports system audit logs as PDF
 * Query params: from, to (YYYY-MM-DD), actionType (optional), entityType (optional)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedRequest, withErrorHandler, errorResponse } from '@/lib/api-utils';
import { getAuditLogs, AuditActionType, AuditEntityType } from '@/lib/services/audit-service';
import {
    createAuditPDF,
    finalizePDF,
    drawSectionTitle,
    drawSummaryRow,
    drawTableHeader,
    drawTableRow,
    addNewPage,
    logPdfExport,
    formatDateTime,
    TableColumn,
} from '@/lib/services/pdf-generator';

export const GET = withErrorHandler(async (request: NextRequest) => {
    return withAuth(request, async (req: AuthenticatedRequest) => {
        const { searchParams } = new URL(request.url);
        const from = searchParams.get('from');
        const to = searchParams.get('to');
        const actionType = searchParams.get('actionType') as AuditActionType | null;
        const entityType = searchParams.get('entityType') as AuditEntityType | null;

        if (!from || !to) {
            return errorResponse('Both from and to date parameters are required (YYYY-MM-DD)');
        }

        const { entries, total } = await getAuditLogs({
            startDate: new Date(from),
            endDate: new Date(to + 'T23:59:59'),
            actionType: actionType || undefined,
            entityType: entityType || undefined,
            limit: 1000,
        });

        const user = req.user!;
        const pdfOptions = {
            title: 'System Audit Log Report',
            subtitle: `Period: ${from} to ${to}`,
            generatedBy: `${user.firstName} ${user.lastName}`,
            actorId: user.id,
            actorRole: user.roleCode,
        };

        const ctx = await createAuditPDF(pdfOptions);

        drawSectionTitle(ctx, 'Summary');
        drawSummaryRow(ctx, 'Total Entries:', total.toString());
        if (actionType) drawSummaryRow(ctx, 'Action Filter:', actionType);
        if (entityType) drawSummaryRow(ctx, 'Entity Filter:', entityType);

        ctx.currentY -= 20;

        drawSectionTitle(ctx, 'Audit Entries');

        const columns: TableColumn[] = [
            { header: 'ID', width: 40 },
            { header: 'Action', width: 100 },
            { header: 'Entity', width: 80 },
            { header: 'Actor', width: 80 },
            { header: 'Role', width: 60 },
            { header: 'Timestamp', width: 120 },
        ];

        drawTableHeader(ctx, columns);

        for (const entry of entries) {
            const values = [
                entry.id.toString(),
                entry.actionType.replace(/_/g, ' '),
                `${entry.entityType}${entry.entityId ? ' #' + entry.entityId : ''}`,
                `${entry.actorType}${entry.actorId ? ' #' + entry.actorId : ''}`,
                entry.actorRole || '-',
                formatDateTime(entry.createdAt),
            ];

            const success = drawTableRow(ctx, columns, values);
            if (!success) {
                addNewPage(ctx, pdfOptions);
                drawTableHeader(ctx, columns);
                drawTableRow(ctx, columns, values);
            }
        }

        const pdfBytes = await finalizePDF(ctx);

        logPdfExport('AUDIT_LOGS', user.id, user.roleCode, { from, to, actionType, entityType, count: total });

        return new NextResponse(Buffer.from(pdfBytes), {
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="audit-logs-${from}-to-${to}.pdf"`,
                'Content-Length': pdfBytes.length.toString(),
            },
        });
    }, { requiredRoles: ['AUDITOR', 'ADMIN'], requiredType: 'user' });
});

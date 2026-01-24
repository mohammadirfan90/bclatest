/**
 * GET /api/v1/auditor/audit-logs - Get system audit logs
 * 
 * Access: Auditor, Admin only
 */

import { NextRequest } from 'next/server';
import {
    withErrorHandler,
    withAuth,
    successResponse,
    AuthenticatedRequest,
} from '@/lib/api-utils';
import { getAuditLogs } from '@/lib/services/audit-service';

export const GET = withErrorHandler(async (request: NextRequest) => {
    return withAuth(
        request,
        async (_req: AuthenticatedRequest) => {
            const searchParams = request.nextUrl.searchParams;
            const limit = parseInt(searchParams.get('limit') || '50');
            const offset = parseInt(searchParams.get('offset') || '0');
            const actorId = searchParams.get('actorId');
            const actorType = searchParams.get('actorType') as 'user' | 'customer' | 'system' | null;
            const actionType = searchParams.get('actionType');
            const entityType = searchParams.get('entityType');
            const entityId = searchParams.get('entityId');
            const startDate = searchParams.get('startDate');
            const endDate = searchParams.get('endDate');

            const result = await getAuditLogs({
                limit: Math.min(limit, 100),
                offset,
                actorId: actorId ? parseInt(actorId) : undefined,
                actorType: actorType || undefined,
                actionType: actionType as any,
                entityType: entityType as any,
                entityId: entityId ? parseInt(entityId) : undefined,
                startDate: startDate ? new Date(startDate) : undefined,
                endDate: endDate ? new Date(endDate) : undefined,
            });

            return successResponse({
                entries: result.entries,
                total: result.total,
                limit,
                offset,
            });
        },
        {
            requiredType: 'user',
            requiredRoles: ['AUDITOR', 'ADMIN'],
        }
    );
});

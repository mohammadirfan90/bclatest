import { NextRequest } from 'next/server';
import {
    withErrorHandler,
    withAuth,
    validateBody,
    successResponse,
    errorResponse,
    AuthenticatedRequest,
} from '@/lib/api-utils';
import { eodProcessSchema, interestPostingSchema } from '@/lib/validations/schemas';
import { callProcedure, query } from '@/lib/db';
import { RowDataPacket } from 'mysql2/promise';

// =============================================================================
// POST /api/v1/admin/eod - Run End of Day Process
// =============================================================================

export async function POST(request: NextRequest) {
    return withErrorHandler(async (req: NextRequest) => {
        return withAuth(
            req,
            async (authReq: AuthenticatedRequest) => {
                const validation = await validateBody(request, eodProcessSchema);
                if (!validation.success) {
                    return validation.response;
                }

                const { processDate } = validation.data;

                const { outParams } = await callProcedure(
                    'sp_eod_process',
                    [processDate, authReq.user!.id],
                    ['p_accounts_processed', 'p_fraud_alerts', 'p_status', 'p_message']
                );

                return successResponse({
                    processDate,
                    accountsProcessed: outParams.p_accounts_processed,
                    fraudAlerts: outParams.p_fraud_alerts,
                    status: outParams.p_status,
                    message: outParams.p_message,
                });
            },
            {
                requiredType: 'user',
                requiredPermissions: ['system.eod'],
            }
        );
    })(request);
}

// =============================================================================
// GET /api/v1/admin/eod - Get EOD job history
// =============================================================================

export async function GET(request: NextRequest) {
    return withErrorHandler(async (req: NextRequest) => {
        return withAuth(
            req,
            async () => {
                interface JobRow extends RowDataPacket {
                    id: number;
                    job_name: string;
                    status: string;
                    scheduled_at: Date;
                    started_at: Date | null;
                    completed_at: Date | null;
                    duration_ms: number | null;
                    result: string | null;
                }

                const jobs = await query<JobRow[]>(
                    `SELECT id, job_name, status, scheduled_at, started_at, completed_at, duration_ms, result
           FROM system_jobs
           WHERE job_type = 'EOD'
           ORDER BY scheduled_at DESC
           LIMIT 50`
                );

                return successResponse(
                    jobs.map((job) => ({
                        id: job.id,
                        jobName: job.job_name,
                        status: job.status,
                        scheduledAt: job.scheduled_at,
                        startedAt: job.started_at,
                        completedAt: job.completed_at,
                        durationMs: job.duration_ms,
                        result: job.result ? JSON.parse(job.result) : null,
                    }))
                );
            },
            {
                requiredType: 'user',
                requiredPermissions: ['system.eod'],
            }
        );
    })(request);
}

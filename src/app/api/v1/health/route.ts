import { NextRequest, NextResponse } from 'next/server';
import { checkConnection } from '@/lib/db';

// =============================================================================
// GET /api/v1/health - Health check endpoint
// =============================================================================

export async function GET() {
    const dbHealthy = await checkConnection();

    const status = dbHealthy ? 'healthy' : 'unhealthy';
    const statusCode = dbHealthy ? 200 : 503;

    return NextResponse.json(
        {
            status,
            timestamp: new Date().toISOString(),
            services: {
                database: dbHealthy ? 'connected' : 'disconnected',
            },
        },
        { status: statusCode }
    );
}

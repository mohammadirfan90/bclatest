import { NextResponse } from 'next/server';
import { SystemJobService } from '@/lib/system-jobs';
import { getSession } from '@/lib/services/auth-service';

export async function GET(req: Request) {
    try {
        const session = await getSession();
        if (!session || session.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { searchParams } = new URL(req.url);
        const limit = parseInt(searchParams.get('limit') || '20');

        const jobs = await SystemJobService.getRecentJobs(limit);

        return NextResponse.json({ success: true, data: jobs });
    } catch (error) {
        console.error('Fetch Jobs Error:', error);
        return NextResponse.json({ error: 'Failed to fetch jobs' }, { status: 500 });
    }
}

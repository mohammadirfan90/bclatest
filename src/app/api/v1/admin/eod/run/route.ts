import { NextResponse } from 'next/server';
import { callProcedure } from '@/lib/db';
import { z } from 'zod';
import { getSession } from '@/lib/services/auth-service';

const eodSchema = z.object({
    runDate: z.string().optional(), // YYYY-MM-DD
});

export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session || session.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        const { runDate } = eodSchema.parse(body);

        // Call stored procedure
        await callProcedure('sp_eod_process', [runDate || null], []);

        return NextResponse.json({ success: true, message: 'EOD Process Initiated' });
    } catch (error) {
        console.error('EOD Trigger Error:', error);
        return NextResponse.json({ error: 'Failed to trigger EOD' }, { status: 500 });
    }
}

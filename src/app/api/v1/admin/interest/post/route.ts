import { NextResponse } from 'next/server';
import { callProcedure, ProcedureResult } from '@/lib/db'; // Import ProcedureResult type
import { z } from 'zod';
import { getSession } from '@/lib/services/auth-service';

const interestSchema = z.object({
    postingDate: z.string().optional(), // YYYY-MM-DD
});

// Define output type for the procedure
interface InterestResult {
    total_posted: number;
    processed_accounts: number;
}

export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session || session.role !== 'ADMIN') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        const { postingDate } = interestSchema.parse(body);

        // Call stored procedure
        // Input: postingDate, Output: total_posted, processed_accounts
        const result = await callProcedure<InterestResult>(
            'sp_post_monthly_interest',
            [postingDate || null],
            ['total_posted', 'processed_accounts']
        );

        return NextResponse.json({
            success: true,
            message: 'Monthly Interest Posted',
            data: result.outParams
        });
    } catch (error) {
        console.error('Interest Posting Error:', error);
        return NextResponse.json({ error: 'Failed to post interest' }, { status: 500 });
    }
}

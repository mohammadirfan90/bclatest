import { NextRequest, NextResponse } from 'next/server';
import { getPendingApplications } from '@/lib/services/account-service';
import { withAuth, successResponse } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
    return withAuth(request, async () => {
        const applications = await getPendingApplications();
        return successResponse(applications);
    }, {
        requiredType: 'user', // Staff only
        // requiredRoles: ['ADMIN', 'BANKER'] // Optional: enforce roles if needed
    });
}

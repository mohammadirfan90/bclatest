import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { applyForAccount, AccountType } from '@/lib/services/account-service';
import { withAuth, validateBody, AuthenticatedRequest, successResponse, errorResponse } from '@/lib/api-utils';

const applySchema = z.object({
    accountType: z.enum(['SAVINGS', 'CURRENT', 'BUSINESS']),
});

export async function POST(request: NextRequest) {
    return withAuth(request, async (req: AuthenticatedRequest) => {
        const validation = await validateBody(request, applySchema);
        if (!validation.success) return validation.response;

        if (!req.user && !req.customer) {
            return errorResponse('Unauthorized', 401);
        }

        // Use customer ID from token (either user-as-customer or direct customer token)
        // If it's a 'user' (staff) applying, they shouldn't generally count as customer unless they have a customer profile?
        // The previous logic assumed `req.user.customerId`. But `AuthenticatedRequest` structure is:
        // user?: User (staff), customer?: { id, ... }.
        // If it's a customer token, we use req.customer.id.

        let customerId: number;
        if (req.customer) {
            customerId = req.customer.id;
        } else {
            return errorResponse('Only customers can apply via this endpoint', 403);
        }

        const result = await applyForAccount(customerId, validation.data.accountType as AccountType);

        if (!result.success) {
            return errorResponse(result.error || 'Application failed');
        }

        return successResponse({
            message: 'Application submitted successfully',
            applicationId: result.applicationId
        }, { status: 201 } as any); // Type assertion if meta param issue
    }, {
        requiredType: 'customer' // Enforce customer token
    });
}

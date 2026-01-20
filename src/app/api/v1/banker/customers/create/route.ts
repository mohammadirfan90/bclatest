
import { NextRequest } from 'next/server';
import {
    withErrorHandler,
    withAuth,
    successResponse,
    errorResponse,
    AuthenticatedRequest,
    validationErrorResponse,
} from '@/lib/api-utils';
import { z } from 'zod';
import { onboardNewCustomer } from '@/lib/services/account-service';

const createCustomerSchema = z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    email: z.string().email(),
    dateOfBirth: z.string(),
});

export const POST = withErrorHandler(async (request: NextRequest) => {
    return withAuth(request, async (req: AuthenticatedRequest) => {
        // 1. Verify Role
        const { user } = req;
        if (!user || (user.roleCode !== 'BANKER' && user.roleCode !== 'ADMIN')) {
            return errorResponse('Unauthorized', 403);
        }

        // 2. Parse Body
        const body = await request.json();
        const result = createCustomerSchema.safeParse(body);

        if (!result.success) {
            return validationErrorResponse(result.error.issues.map((e: z.ZodIssue) => ({ field: e.path.join('.'), message: e.message })));
        }

        const { firstName, lastName, email, dateOfBirth } = result.data;

        // 3. Auto-generate Customer Number (matches existing CUS-XXXX format)
        const customerNumber = `CUS-${Date.now().toString().slice(-6).padStart(4, '0')}`;

        // 4. Onboard Customer and Default Account
        const onboardResult = await onboardNewCustomer({
            firstName,
            lastName,
            email,
            dateOfBirth,
            customerNumber,
            createdBy: user.id
        });

        if (!onboardResult.success) {
            return errorResponse(onboardResult.error || 'Onboarding failed', 400);
        }

        return successResponse({
            message: 'Customer created successfully',
            customerId: onboardResult.customerId,
            customerNumber: customerNumber,
            email: email,
            tempPassword: onboardResult.tempPassword, // Show to banker
        });

    }, { requiredRoles: ['BANKER', 'ADMIN'], hideFailure: true });
});

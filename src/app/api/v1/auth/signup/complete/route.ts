
import { NextRequest } from 'next/server';
import {
    withErrorHandler,
    successResponse,
    errorResponse,
} from '@/lib/api-utils';
import { completeSignup } from '@/lib/services/auth-service';
import { z } from 'zod';
import { strongPasswordSchema } from '@/lib/validations/schemas';

const completeSignupSchema = z.object({
    token: z.string(),
    password: strongPasswordSchema,
});

export const POST = withErrorHandler(async (request: NextRequest) => {
    const body = await request.json();
    const result = completeSignupSchema.safeParse(body);

    if (!result.success) {
        return errorResponse('Validation failed: ' + result.error.issues.map(e => e.message).join(', '), 400);
    }

    const { token, password } = result.data;

    const signupResult = await completeSignup(token, password);

    if (!signupResult.success) {
        return errorResponse(signupResult.error || 'Signup failed', 400);
    }

    return successResponse({
        message: 'Signup complete! Your account is pending banker approval. You will be notified when active.'
    });
});

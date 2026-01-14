import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, TokenPayload, User } from '@/lib/services/auth-service';
import { query } from '@/lib/db';
import { RowDataPacket } from 'mysql2/promise';
import { ZodSchema, ZodError } from 'zod';

// =============================================================================
// Types
// =============================================================================

export interface AuthenticatedRequest extends NextRequest {
    user?: User;
    customer?: {
        id: number;
        customerNumber: string;
        email: string;
    };
    tokenPayload?: TokenPayload;
}

export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    errors?: Array<{ field: string; message: string }>;
    meta?: {
        page?: number;
        limit?: number;
        total?: number;
        totalPages?: number;
    };
}

// =============================================================================
// Response Helpers
// =============================================================================

export function successResponse<T>(data: T, meta?: ApiResponse['meta']): NextResponse {
    return NextResponse.json({ success: true, data, meta }, { status: 200 });
}

export function createdResponse<T>(data: T): NextResponse {
    return NextResponse.json({ success: true, data }, { status: 201 });
}

export function errorResponse(error: string, status: number = 400): NextResponse {
    return NextResponse.json({ success: false, error }, { status });
}

export function validationErrorResponse(errors: Array<{ field: string; message: string }>): NextResponse {
    return NextResponse.json({ success: false, error: 'Validation failed', errors }, { status: 400 });
}

export function unauthorizedResponse(error: string = 'Unauthorized'): NextResponse {
    return NextResponse.json({ success: false, error }, { status: 401 });
}

export function forbiddenResponse(error: string = 'Forbidden'): NextResponse {
    return NextResponse.json({ success: false, error }, { status: 403 });
}

export function notFoundResponse(error: string = 'Not found'): NextResponse {
    return NextResponse.json({ success: false, error }, { status: 404 });
}

export function serverErrorResponse(error: string = 'Internal server error'): NextResponse {
    return NextResponse.json({ success: false, error }, { status: 500 });
}

// =============================================================================
// Authentication Middleware
// =============================================================================

export async function withAuth(
    request: NextRequest,
    handler: (req: AuthenticatedRequest) => Promise<NextResponse>,
    options: {
        requiredType?: 'user' | 'customer' | 'any';
        requiredRoles?: string[];
        requiredPermissions?: string[];
        hideFailure?: boolean; // If true, returns 404 instead of 401/403 to hide existence
    } = {}
): Promise<NextResponse> {
    const { requiredType = 'any', requiredRoles, requiredPermissions, hideFailure = false } = options;

    // Helper to return 404 if hideFailure is on, otherwise the actual error
    const getErrorResponse = (actualResponse: NextResponse) => {
        return hideFailure ? notFoundResponse() : actualResponse;
    };

    // Get token from header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return getErrorResponse(unauthorizedResponse('No token provided'));
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);

    if (!payload) {
        return getErrorResponse(unauthorizedResponse('Invalid or expired token'));
    }

    // Check required type
    if (requiredType !== 'any' && payload.type !== requiredType) {
        return getErrorResponse(forbiddenResponse(`Access restricted to ${requiredType}s`));
    }

    const authenticatedRequest = request as AuthenticatedRequest;
    authenticatedRequest.tokenPayload = payload;

    // For user tokens, load full user info
    if (payload.type === 'user') {
        interface UserRow extends RowDataPacket {
            id: number;
            email: string;
            first_name: string;
            last_name: string;
            role_id: number;
            role_code: string;
            role_name: string;
            permissions: string;
            status: string;
        }

        const [userRow] = await query<UserRow[]>(
            `SELECT u.id, u.email, u.first_name, u.last_name, u.role_id,
              r.code as role_code, r.name as role_name, r.permissions,
              u.status
       FROM users u
       INNER JOIN roles r ON r.id = u.role_id
       WHERE u.id = ? AND u.status = 'ACTIVE'`,
            [payload.sub]
        );

        if (!userRow) {
            return getErrorResponse(unauthorizedResponse('User not found or inactive'));
        }

        // Safely parse permissions - handle invalid JSON gracefully
        let permissions: string[] = [];
        try {
            const rawPerms = userRow.permissions;
            if (rawPerms && typeof rawPerms === 'string' && rawPerms.startsWith('[')) {
                permissions = JSON.parse(rawPerms);
            } else if (Array.isArray(rawPerms)) {
                permissions = rawPerms;
            }
        } catch (e) {
            console.warn('Invalid permissions JSON, defaulting to empty array');
            permissions = [];
        }

        authenticatedRequest.user = {
            id: userRow.id,
            email: userRow.email,
            firstName: userRow.first_name,
            lastName: userRow.last_name,
            roleId: userRow.role_id,
            roleCode: userRow.role_code,
            roleName: userRow.role_name,
            permissions,
            status: userRow.status,
            mfaEnabled: false, // Simplified - no MFA
        };

        // Check required roles
        if (requiredRoles && requiredRoles.length > 0) {
            if (!requiredRoles.includes(userRow.role_code)) {
                return getErrorResponse(forbiddenResponse('Insufficient role privileges'));
            }
        }

        // Check required permissions
        if (requiredPermissions && requiredPermissions.length > 0) {
            const hasPermission = requiredPermissions.some((p) => permissions.includes(p));
            if (!hasPermission) {
                return getErrorResponse(forbiddenResponse('Insufficient permissions'));
            }
        }
    }

    // For customer tokens
    if (payload.type === 'customer') {
        interface CustomerRow extends RowDataPacket {
            id: number;
            customer_number: string;
            email: string;
            status: string;
        }

        const [customerRow] = await query<CustomerRow[]>(
            `SELECT id, customer_number, email, status
       FROM customers
       WHERE id = ? AND status = 'ACTIVE'`,
            [payload.sub]
        );

        if (!customerRow) {
            return unauthorizedResponse('Customer not found or inactive');
        }

        authenticatedRequest.customer = {
            id: customerRow.id,
            customerNumber: customerRow.customer_number,
            email: customerRow.email,
        };
    }

    return handler(authenticatedRequest);
}

// =============================================================================
// Validation Middleware
// =============================================================================

export async function validateBody<T>(
    request: NextRequest,
    schema: ZodSchema<T>
): Promise<{ success: true; data: T } | { success: false; response: NextResponse }> {
    try {
        const body = await request.json();
        const data = schema.parse(body);
        return { success: true, data };
    } catch (error) {
        if (error instanceof ZodError) {
            const errors = error.issues.map((e) => ({
                field: e.path.join('.'),
                message: e.message,
            }));
            return { success: false, response: validationErrorResponse(errors) };
        }
        return { success: false, response: errorResponse('Invalid request body') };
    }
}

export function validateQuery<T>(
    request: NextRequest,
    schema: ZodSchema<T>
): { success: true; data: T } | { success: false; response: NextResponse } {
    try {
        const searchParams = Object.fromEntries(request.nextUrl.searchParams.entries());
        const data = schema.parse(searchParams);
        return { success: true, data };
    } catch (error) {
        if (error instanceof ZodError) {
            const errors = error.issues.map((e) => ({
                field: e.path.join('.'),
                message: e.message,
            }));
            return { success: false, response: validationErrorResponse(errors) };
        }
        return { success: false, response: errorResponse('Invalid query parameters') };
    }
}

// =============================================================================
// Idempotency Middleware
// =============================================================================

export function getIdempotencyKey(request: NextRequest): string | null {
    return request.headers.get('Idempotency-Key') ||
        request.headers.get('idempotency-key') ||
        null;
}

export function requireIdempotencyKey(request: NextRequest): { success: true; key: string } | { success: false; response: NextResponse } {
    const key = getIdempotencyKey(request);
    if (!key) {
        return {
            success: false,
            response: errorResponse('Idempotency-Key header is required for this operation', 400)
        };
    }
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(key)) {
        return {
            success: false,
            response: errorResponse('Invalid Idempotency-Key format. Must be a valid UUID.', 400)
        };
    }
    return { success: true, key };
}

export async function checkIdempotency(
    idempotencyKey: string | undefined
): Promise<{ cached: true; response: NextResponse } | { cached: false }> {
    if (!idempotencyKey) {
        return { cached: false };
    }

    interface CachedRow extends RowDataPacket {
        response_status: number;
        response_body: string;
    }

    const [cached] = await query<CachedRow[]>(
        `SELECT response_status, response_body
     FROM idempotency_keys
     WHERE idempotency_key = ? AND expires_at > NOW()`,
        [idempotencyKey]
    );

    if (cached) {
        const body = JSON.parse(cached.response_body);
        return {
            cached: true,
            response: NextResponse.json(body, { status: cached.response_status }),
        };
    }

    return { cached: false };
}

// =============================================================================
// Error Handler Wrapper
// =============================================================================

export function withErrorHandler<T = { id?: string }>(
    handler: (request: NextRequest, context?: { params: Promise<T> }) => Promise<NextResponse>
): (request: NextRequest, context?: { params: Promise<T> }) => Promise<NextResponse> {
    return async (request: NextRequest, context?: { params: Promise<T> }) => {
        try {
            // Context is optional - routes without dynamic params won't have it
            return await handler(request, context);
        } catch (error) {
            console.error('API Error:', error);

            if (error instanceof Error) {
                // Don't expose internal error messages in production
                const message = process.env.NODE_ENV === 'development'
                    ? error.message
                    : 'An unexpected error occurred';
                return serverErrorResponse(message);
            }

            return serverErrorResponse();
        }
    };
}

// =============================================================================
// Pagination Helper
// =============================================================================

export function getPaginationMeta(page: number, limit: number, total: number) {
    return {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
    };
}

export function getOffset(page: number, limit: number): number {
    return (page - 1) * limit;
}

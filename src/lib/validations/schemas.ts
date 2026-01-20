import { z } from 'zod';

// =============================================================================
// Common Validators
// =============================================================================

export const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const idParamSchema = z.object({
    id: z.coerce.number().int().positive(),
});

// =============================================================================
// Auth Validators
// =============================================================================

export const loginSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required'),
    type: z.enum(['user', 'customer']).default('user'),
});

export const refreshTokenSchema = z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
});

// =============================================================================
// Customer Validators
// =============================================================================

// =============================================================================
// Common Validators
// =============================================================================

export const strongPasswordSchema = z.string()
    .min(8, 'Password must be at least 8 characters')
    // Regex: At least one uppercase, one lowercase, one number, one special char
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const createCustomerSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: strongPasswordSchema,
    firstName: z.string().min(1, 'First name is required').max(100),
    lastName: z.string().min(1, 'Last name is required').max(100),
    phone: z.string().max(20).optional(),
    dateOfBirth: z.string().datetime().optional().transform((val) => val ? new Date(val) : undefined),
    nationalId: z.string().max(50).optional(),
    addressLine1: z.string().max(255).optional(),
    addressLine2: z.string().max(255).optional(),
    city: z.string().max(100).optional(),
    postalCode: z.string().max(20).optional(),
});

export const updateCustomerSchema = z.object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    phone: z.string().max(20).optional(),
    addressLine1: z.string().max(255).optional(),
    addressLine2: z.string().max(255).optional(),
    city: z.string().max(100).optional(),
    postalCode: z.string().max(20).optional(),
});

export const customerSearchSchema = z.object({
    search: z.string().optional(),
    status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED']).optional(),
    kycStatus: z.enum(['NOT_STARTED', 'PENDING', 'VERIFIED', 'REJECTED']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const updateCustomerStatusSchema = z.object({
    status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED']),
});

export const updateKycStatusSchema = z.object({
    status: z.enum(['NOT_STARTED', 'PENDING', 'VERIFIED', 'REJECTED']),
});

// =============================================================================
// Account Validators
// =============================================================================

export const createAccountSchema = z.object({
    customerId: z.number().int().positive(),
    accountType: z.enum(['SAVINGS', 'CHECKING', 'FIXED']),
});

export const updateAccountStatusSchema = z.object({
    status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED']),
    reason: z.string().min(1, 'Reason is required').max(500),
});

// =============================================================================
// Transaction Validators
// =============================================================================

// BDT amount validator - max 10 million, min 1
const bdtAmount = z.number()
    .positive('Amount must be positive')
    .max(10000000, 'Amount exceeds maximum limit of ৳10,000,000')
    .transform((val) => Math.round(val * 100) / 100); // Round to 2 decimal places

export const transferSchema = z.object({
    fromAccountId: z.number().int().positive('Source account is required'),
    toAccountNumber: z.string().min(1, 'Destination account number is required'),
    amount: bdtAmount,
    description: z.string().max(500).optional(),
    idempotencyKey: z.string().uuid().optional(),
});

export const depositSchema = z.object({
    accountId: z.number().int().positive('Account is required'),
    amount: bdtAmount,
    description: z.string().max(500).optional(),
    externalReference: z.string().max(100).optional(),
    idempotencyKey: z.string().uuid('Invalid idempotency key format').optional(),
});

export const withdrawSchema = z.object({
    accountId: z.number().int().positive('Account is required'),
    amount: bdtAmount,
    description: z.string().max(500).optional(),
    externalReference: z.string().max(100).optional(),
    idempotencyKey: z.string().uuid('Invalid idempotency key format').optional(),
});

export const reversalSchema = z.object({
    reason: z.string().min(1, 'Reason is required').max(500),
});

export const transactionSearchSchema = z.object({
    accountId: z.coerce.number().int().positive().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    status: z.enum(['PENDING', 'COMPLETED', 'FAILED', 'REVERSED', 'CANCELLED']).optional(),
    type: z.string().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(50),
});

// =============================================================================
// Reconciliation Validators
// =============================================================================

export const createReconciliationSchema = z.object({
    name: z.string().min(1, 'Name is required').max(255),
    sourceType: z.enum(['BANK_STATEMENT', 'PAYMENT_GATEWAY', 'MANUAL']),
});

export const matchReconciliationItemSchema = z.object({
    transactionId: z.number().int().positive(),
    matchReason: z.string().max(500).optional(),
});

export const unmatchReconciliationItemSchema = z.object({
    reason: z.string().min(1, 'Reason is required').max(500),
});

// =============================================================================
// Fraud Validators
// =============================================================================

export const fraudReviewSchema = z.object({
    decision: z.enum(['APPROVED', 'REJECTED', 'ESCALATED']),
    notes: z.string().min(1, 'Notes are required').max(2000),
});

export const fraudAssignSchema = z.object({
    assignedTo: z.number().int().positive(),
});

// =============================================================================
// Admin Validators
// =============================================================================

export const createUserSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    roleId: z.number().int().positive(),
});

export const updateUserSchema = z.object({
    firstName: z.string().min(1).max(100).optional(),
    lastName: z.string().min(1).max(100).optional(),
    roleId: z.number().int().positive().optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'LOCKED', 'PENDING']).optional(),
});

export const eodProcessSchema = z.object({
    processDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (YYYY-MM-DD)'),
});

export const interestPostingSchema = z.object({
    year: z.number().int().min(2020).max(2100),
    month: z.number().int().min(1).max(12),
});

export const eventReplaySchema = z.object({
    startEventId: z.number().int().positive().optional(),
    endEventId: z.number().int().positive().optional(),
    eventType: z.string().optional(),
});

export const pseudonymizeSchema = z.object({
    reason: z.string().min(1, 'Reason is required').max(500),
});

export const systemConfigSchema = z.object({
    configKey: z.string().min(1).max(100),
    configValue: z.string(),
    valueType: z.enum(['STRING', 'NUMBER', 'BOOLEAN', 'JSON']).default('STRING'),
    description: z.string().max(500).optional(),
});

// =============================================================================
// Type Exports
// =============================================================================

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
export type DepositInput = z.infer<typeof depositSchema>;
export type WithdrawInput = z.infer<typeof withdrawSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;

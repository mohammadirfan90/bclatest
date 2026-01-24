/**
 * Banking Core - Audit Service
 * Centralized service for system audit logging
 * 
 * Version: 1.0.0
 * Date: 2026-01-24
 */

import { execute, query, queryOne } from '../db';
import { RowDataPacket } from 'mysql2/promise';

// =============================================================================
// Types
// =============================================================================

export type AuditActionType =
    | 'ACCOUNT_CREATED'
    | 'ACCOUNT_FROZEN'
    | 'ACCOUNT_UNFROZEN'
    | 'ACCOUNT_CLOSED'
    | 'CUSTOMER_CREATED'
    | 'USER_LOGIN'
    | 'USER_LOGOUT'
    | 'CUSTOMER_LOGIN'
    | 'CUSTOMER_LOGOUT'
    | 'BALANCE_REBUILD'
    | 'ROLE_CHANGED'
    | 'PASSWORD_CHANGED'
    | 'PDF_EXPORTED';

export type AuditEntityType =
    | 'ACCOUNT'
    | 'CUSTOMER'
    | 'USER'
    | 'SESSION'
    | 'TRANSACTION'
    | 'REPORT';

export type AuditActorType = 'user' | 'customer' | 'system';

export interface AuditLogEntry {
    id: number;
    actorId: number | null;
    actorType: AuditActorType;
    actorRole: string | null;
    actionType: AuditActionType;
    entityType: AuditEntityType;
    entityId: number | null;
    beforeState: Record<string, unknown> | null;
    afterState: Record<string, unknown> | null;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
}

export interface LogAuditEventParams {
    actorId?: number | null;
    actorType: AuditActorType;
    actorRole?: string | null;
    actionType: AuditActionType;
    entityType: AuditEntityType;
    entityId?: number | null;
    beforeState?: Record<string, unknown> | null;
    afterState?: Record<string, unknown> | null;
    metadata?: Record<string, unknown> | null;
}

// =============================================================================
// Audit Logging (Non-blocking, Failure-tolerant)
// =============================================================================

/**
 * Log an audit event to the audit_logs table.
 * This function is non-blocking and failure-tolerant - it will catch and log
 * any errors without affecting the main operation flow.
 */
export async function logAuditEvent(params: LogAuditEventParams): Promise<void> {
    try {
        await execute(
            `INSERT INTO audit_logs 
             (actor_id, actor_type, actor_role, action_type, entity_type, entity_id, before_state, after_state, metadata)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                params.actorId ?? null,
                params.actorType,
                params.actorRole ?? null,
                params.actionType,
                params.entityType,
                params.entityId ?? null,
                params.beforeState ? JSON.stringify(params.beforeState) : null,
                params.afterState ? JSON.stringify(params.afterState) : null,
                params.metadata ? JSON.stringify(params.metadata) : null,
            ]
        );
    } catch (error) {
        // Non-blocking: log error but don't throw
        console.error('[AuditService] Failed to log audit event:', error);
    }
}

/**
 * Fire-and-forget version - doesn't await the result.
 * Use this when you don't want to block the main operation at all.
 */
export function logAuditEventAsync(params: LogAuditEventParams): void {
    logAuditEvent(params).catch((err) => {
        console.error('[AuditService] Async audit log failed:', err);
    });
}

// =============================================================================
// Audit Log Queries (Read-only, for Auditor access)
// =============================================================================

interface AuditLogRow extends RowDataPacket {
    id: number;
    actor_id: number | null;
    actor_type: string;
    actor_role: string | null;
    action_type: string;
    entity_type: string;
    entity_id: number | null;
    before_state: string | null;
    after_state: string | null;
    metadata: string | null;
    created_at: Date;
}

export interface GetAuditLogsOptions {
    limit?: number;
    offset?: number;
    actorId?: number;
    actorType?: AuditActorType;
    actionType?: AuditActionType;
    entityType?: AuditEntityType;
    entityId?: number;
    startDate?: Date;
    endDate?: Date;
}

export async function getAuditLogs(
    options: GetAuditLogsOptions = {}
): Promise<{ entries: AuditLogEntry[]; total: number }> {
    const {
        limit = 50,
        offset = 0,
        actorId,
        actorType,
        actionType,
        entityType,
        entityId,
        startDate,
        endDate,
    } = options;

    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];

    if (actorId !== undefined) {
        conditions.push('actor_id = ?');
        params.push(actorId);
    }

    if (actorType) {
        conditions.push('actor_type = ?');
        params.push(actorType);
    }

    if (actionType) {
        conditions.push('action_type = ?');
        params.push(actionType);
    }

    if (entityType) {
        conditions.push('entity_type = ?');
        params.push(entityType);
    }

    if (entityId !== undefined) {
        conditions.push('entity_id = ?');
        params.push(entityId);
    }

    if (startDate) {
        conditions.push('created_at >= ?');
        params.push(startDate);
    }

    if (endDate) {
        conditions.push('created_at <= ?');
        params.push(endDate);
    }

    const whereClause = conditions.join(' AND ');

    // Get total count
    interface CountRow extends RowDataPacket {
        count: number;
    }
    const countRow = await queryOne<CountRow>(
        `SELECT COUNT(*) as count FROM audit_logs WHERE ${whereClause}`,
        params
    );

    // Get entries
    const rows = await query<AuditLogRow[]>(
        `SELECT id, actor_id, actor_type, actor_role, action_type, entity_type, 
                entity_id, before_state, after_state, metadata, created_at
         FROM audit_logs
         WHERE ${whereClause}
         ORDER BY created_at DESC, id DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );

    return {
        entries: rows.map(mapAuditLogRow),
        total: countRow?.count || 0,
    };
}

/**
 * Get action type counts for dashboard statistics
 */
export async function getAuditStats(): Promise<{
    totalLogs: number;
    todayLogs: number;
    actionCounts: Record<string, number>;
}> {
    interface TotalRow extends RowDataPacket {
        total: number;
    }
    const totalRow = await queryOne<TotalRow>(
        'SELECT COUNT(*) as total FROM audit_logs'
    );

    const todayRow = await queryOne<TotalRow>(
        'SELECT COUNT(*) as total FROM audit_logs WHERE DATE(created_at) = CURDATE()'
    );

    interface ActionCountRow extends RowDataPacket {
        action_type: string;
        count: number;
    }
    const actionRows = await query<ActionCountRow[]>(
        `SELECT action_type, COUNT(*) as count 
         FROM audit_logs 
         GROUP BY action_type 
         ORDER BY count DESC`
    );

    const actionCounts: Record<string, number> = {};
    for (const row of actionRows) {
        actionCounts[row.action_type] = row.count;
    }

    return {
        totalLogs: totalRow?.total || 0,
        todayLogs: todayRow?.total || 0,
        actionCounts,
    };
}

// =============================================================================
// Helper Functions
// =============================================================================

function mapAuditLogRow(row: AuditLogRow): AuditLogEntry {
    return {
        id: row.id,
        actorId: row.actor_id,
        actorType: row.actor_type as AuditActorType,
        actorRole: row.actor_role,
        actionType: row.action_type as AuditActionType,
        entityType: row.entity_type as AuditEntityType,
        entityId: row.entity_id,
        beforeState: row.before_state ? JSON.parse(row.before_state) : null,
        afterState: row.after_state ? JSON.parse(row.after_state) : null,
        metadata: row.metadata ? JSON.parse(row.metadata) : null,
        createdAt: row.created_at,
    };
}

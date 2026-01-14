import mysql, { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import fs from 'fs';
import path from 'path';

// =============================================================================
// Database Configuration
// =============================================================================

// Load SSL certificate for Azure MySQL
const getSSLConfig = () => {
  if (process.env.DATABASE_SSL !== 'true') return undefined;

  const certPath = path.join(process.cwd(), 'cert', 'DigiCertGlobalRootCA.crt');
  try {
    if (fs.existsSync(certPath)) {
      return {
        ca: fs.readFileSync(certPath),
        rejectUnauthorized: false, // Azure MySQL uses self-signed cert chain
      };
    }
  } catch {
    console.warn('[DB] SSL certificate not found, using default SSL config');
  }
  return { rejectUnauthorized: false };
};

const poolConfig = {
  host: process.env.DATABASE_HOST || 'localhost',
  port: parseInt(process.env.DATABASE_PORT || '3306'),
  user: process.env.DATABASE_USER || 'root',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'bnkcore',
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DATABASE_POOL_MAX || '10'),
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  ssl: getSSLConfig(),
};

// =============================================================================
// Connection Pool (Singleton)
// =============================================================================

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = mysql.createPool(poolConfig);

    // Log pool events in development
    if (process.env.NODE_ENV === 'development' && process.env.ENABLE_QUERY_LOGGING === 'true') {
      pool.on('connection', () => {
        console.log('[DB] New connection established');
      });

      pool.on('release', () => {
        console.log('[DB] Connection released');
      });
    }
  }
  return pool;
}

// =============================================================================
// Query Helpers
// =============================================================================

export async function query<T extends RowDataPacket[]>(
  sql: string,
  params?: unknown[]
): Promise<T> {
  const pool = getPool();
  const [rows] = await pool.query<T>(sql, params);
  return rows;
}

export async function queryOne<T extends RowDataPacket>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T[]>(sql, params);
  return rows[0] || null;
}

export async function execute(
  sql: string,
  params?: unknown[]
): Promise<ResultSetHeader> {
  const pool = getPool();
  const [result] = await pool.execute<ResultSetHeader>(sql, params);
  return result;
}

// =============================================================================
// Transaction Helper
// =============================================================================

export async function withTransaction<T>(
  callback: (connection: PoolConnection) => Promise<T>
): Promise<T> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// =============================================================================
// Stored Procedure Caller
// =============================================================================

export interface ProcedureResult<T = unknown> {
  results: T[];
  outParams: Record<string, unknown>;
}

export async function callProcedure<T = unknown>(
  procedureName: string,
  inParams: unknown[],
  outParamNames: string[]
): Promise<ProcedureResult<T>> {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    // Build the CALL statement with parameter placeholders
    const inPlaceholders = inParams.map(() => '?').join(', ');
    const outPlaceholders = outParamNames.map((name) => `@${name}`).join(', ');
    const allPlaceholders = [inPlaceholders, outPlaceholders].filter(Boolean).join(', ');

    const callSql = `CALL ${procedureName}(${allPlaceholders})`;

    // Execute the procedure
    const [results] = await connection.query(callSql, inParams);

    // Get output parameters
    const outParams: Record<string, unknown> = {};
    if (outParamNames.length > 0) {
      const selectOutSql = `SELECT ${outParamNames.map((name) => `@${name} AS ${name}`).join(', ')}`;
      const [outRows] = await connection.query<RowDataPacket[]>(selectOutSql);
      if (outRows[0]) {
        Object.assign(outParams, outRows[0]);
      }
    }

    // Handle multiple result sets from stored procedure
    const resultSets = Array.isArray(results) ? results : [results];
    const dataResults = resultSets.filter(
      (r) => Array.isArray(r) && r.length > 0 && !('affectedRows' in r[0])
    ) as T[];

    return { results: dataResults, outParams };
  } finally {
    connection.release();
  }
}

// =============================================================================
// Health Check
// =============================================================================

export async function checkConnection(): Promise<boolean> {
  try {
    const pool = getPool();
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    return true;
  } catch {
    return false;
  }
}

// =============================================================================
// Cleanup
// =============================================================================

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

// =============================================================================
// Export types
// =============================================================================

export type { Pool, PoolConnection, RowDataPacket, ResultSetHeader };

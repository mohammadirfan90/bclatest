import { query, queryOne, RowDataPacket } from './db';

export interface SystemJob extends RowDataPacket {
    id: number;
    job_name: string;
    started_at: Date;
    completed_at: Date | null;
    status: 'RUNNING' | 'COMPLETED' | 'FAILED';
    metadata: any;
    error_message: string | null;
}

export const SystemJobService = {
    async getRecentJobs(limit: number = 20): Promise<SystemJob[]> {
        return query<SystemJob[]>(
            `SELECT * FROM system_jobs ORDER BY started_at DESC LIMIT ?`,
            [limit]
        );
    },

    async getJobById(id: number): Promise<SystemJob | null> {
        return queryOne<SystemJob>(
            `SELECT * FROM system_jobs WHERE id = ?`,
            [id]
        );
    },

    async getJobsByName(name: string, limit: number = 10): Promise<SystemJob[]> {
        return query<SystemJob[]>(
            `SELECT * FROM system_jobs WHERE job_name = ? ORDER BY started_at DESC LIMIT ?`,
            [name, limit]
        );
    }
};

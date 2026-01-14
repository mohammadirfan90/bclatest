'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Play, RefreshCw, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

interface SystemJob {
    id: number;
    job_name: string;
    started_at: string;
    completed_at: string | null;
    status: 'RUNNING' | 'COMPLETED' | 'FAILED';
    metadata: any;
    error_message: string | null;
}

export default function SystemJobsPage() {
    const [jobs, setJobs] = useState<SystemJob[]>([]);
    const [loading, setLoading] = useState(true);
    const [triggering, setTriggering] = useState<string | null>(null);

    const fetchJobs = async () => {
        try {
            const res = await fetch('/api/v1/admin/jobs');
            const data = await res.json();
            if (data.success) {
                setJobs(data.data);
            }
        } catch (error) {
            console.error(error);
            toast.error('Failed to load jobs');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchJobs();
        const interval = setInterval(fetchJobs, 5000); // Auto refresh
        return () => clearInterval(interval);
    }, []);

    const runEod = async () => {
        if (!confirm('Are you sure you want to run the End of Day process manually? This will calculate daily interest.')) return;
        setTriggering('EOD');
        try {
            const res = await fetch('/api/v1/admin/eod/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            if (res.ok) {
                toast.success('EOD Process Initiated');
                fetchJobs();
            } else {
                toast.error('Failed to start EOD');
            }
        } catch {
            toast.error('Error triggering EOD');
        } finally {
            setTriggering(null);
        }
    };

    const postInterest = async () => {
        if (!confirm('Are you sure you want to Post Monthly Interest manually? This updates ledger balances.')) return;
        setTriggering('INTEREST');
        try {
            const res = await fetch('/api/v1/admin/interest/post', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
            const data = await res.json();
            if (res.ok) {
                toast.success(`Interest Posted! Processed: ${data.data?.processed_accounts || 0}`);
                fetchJobs();
            } else {
                toast.error('Failed to post interest');
            }
        } catch {
            toast.error('Error triggering interest post');
        } finally {
            setTriggering(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">System Jobs</h1>
                    <p className="text-slate-500">Monitor and trigger system processes</p>
                </div>
                <div className="space-x-2">
                    <Button onClick={fetchJobs} variant="outline" size="sm">
                        <RefreshCw className="w-4 h-4 mr-2" /> Refresh
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                    <CardHeader>
                        <CardTitle>Manual Triggers</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between border p-4 rounded-lg">
                            <div>
                                <h3 className="font-medium">End of Day (EOD)</h3>
                                <p className="text-sm text-slate-500">Calculates daily interest accruals.</p>
                            </div>
                            <Button onClick={runEod} disabled={!!triggering}>
                                {triggering === 'EOD' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                                Run EOD
                            </Button>
                        </div>
                        <div className="flex items-center justify-between border p-4 rounded-lg">
                            <div>
                                <h3 className="font-medium">Post Monthly Interest</h3>
                                <p className="text-sm text-slate-500">Credits accrued interest to accounts.</p>
                            </div>
                            <Button onClick={postInterest} disabled={!!triggering} variant="secondary">
                                {triggering === 'INTEREST' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                                Post Interest
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Job Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-sm text-slate-500">
                            Latest Status: {jobs[0]?.status || 'Idle'} <br />
                            Last Run: {jobs[0]?.started_at ? new Date(jobs[0].started_at).toLocaleString() : 'Never'}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Job History</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="rounded-md border">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50">
                                <tr className="border-b">
                                    <th className="p-3 text-left font-medium">Job Name</th>
                                    <th className="p-3 text-left font-medium">Status</th>
                                    <th className="p-3 text-left font-medium">Started</th>
                                    <th className="p-3 text-left font-medium">Duration</th>
                                    <th className="p-3 text-left font-medium">Metadata</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={5} className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" /></td></tr>
                                ) : jobs.length === 0 ? (
                                    <tr><td colSpan={5} className="p-8 text-center text-slate-500">No jobs found</td></tr>
                                ) : (
                                    jobs.map((job) => (
                                        <tr key={job.id} className="border-b last:border-0 hover:bg-slate-50">
                                            <td className="p-3 font-medium">{job.job_name}</td>
                                            <td className="p-3">
                                                <Badge variant={job.status === 'COMPLETED' ? 'default' : job.status === 'RUNNING' ? 'secondary' : 'destructive'}>
                                                    {job.status === 'COMPLETED' && <CheckCircle className="w-3 h-3 mr-1" />}
                                                    {job.status === 'FAILED' && <AlertCircle className="w-3 h-3 mr-1" />}
                                                    {job.status === 'RUNNING' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                                                    {job.status}
                                                </Badge>
                                            </td>
                                            <td className="p-3 text-slate-500">
                                                {new Date(job.started_at).toLocaleString()}
                                            </td>
                                            <td className="p-3 text-slate-500">
                                                {job.completed_at ?
                                                    `${((new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) / 1000).toFixed(2)}s`
                                                    : '-'}
                                            </td>
                                            <td className="p-3 text-xs font-mono text-slate-500 max-w-[300px] truncate">
                                                {JSON.stringify(job.metadata || {})}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

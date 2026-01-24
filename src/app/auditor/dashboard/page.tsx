'use client';

import { useState, useEffect } from 'react';
import { apiClient } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// =============================================================================
// Types
// =============================================================================

interface DashboardSummary {
    auditLogs: {
        total: number;
        today: number;
        byAction: Record<string, number>;
    };
    transactions: {
        total: number;
        today: number;
    };
    accounts: {
        total: number;
        active: number;
    };
    customers: {
        total: number;
    };
    integrity: {
        doubleEntryValid: boolean;
        doubleEntryDiscrepancy: number;
        balanceIntegrityValid: boolean;
        balanceDiscrepancies: number;
    };
}

// =============================================================================
// Component
// =============================================================================

export default function AuditorDashboardPage() {
    const [summary, setSummary] = useState<DashboardSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchSummary() {
            try {
                const res = await apiClient<DashboardSummary>('/auditor/summary');
                if (res.success && res.data) {
                    setSummary(res.data);
                } else {
                    setError(res.error || 'Failed to load summary');
                }
            } catch (err) {
                setError('Failed to load dashboard data');
            } finally {
                setLoading(false);
            }
        }
        fetchSummary();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin h-8 w-8 border-4 border-slate-900 border-t-transparent rounded-full" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-50 text-red-700 rounded-lg">
                {error}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Audit Dashboard</h1>
                <p className="text-slate-600">System health overview and audit activity summary</p>
            </div>

            {/* Integrity Status */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        System Integrity
                        {summary?.integrity.doubleEntryValid && summary?.integrity.balanceIntegrityValid ? (
                            <Badge className="bg-green-100 text-green-700">Healthy</Badge>
                        ) : (
                            <Badge variant="destructive">Issues Detected</Badge>
                        )}
                    </CardTitle>
                    <CardDescription>Real-time ledger and balance verification</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 rounded-lg bg-slate-50">
                            <div className="flex items-center gap-2">
                                {summary?.integrity.doubleEntryValid ? (
                                    <svg className="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                ) : (
                                    <svg className="h-5 w-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                )}
                                <span className="font-medium text-slate-900">Double-Entry Balance</span>
                            </div>
                            <p className="mt-1 text-sm text-slate-500">
                                {summary?.integrity.doubleEntryValid
                                    ? 'All debits equal credits'
                                    : `Discrepancy: ${summary?.integrity.doubleEntryDiscrepancy}`}
                            </p>
                        </div>
                        <div className="p-4 rounded-lg bg-slate-50">
                            <div className="flex items-center gap-2">
                                {summary?.integrity.balanceIntegrityValid ? (
                                    <svg className="h-5 w-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                ) : (
                                    <svg className="h-5 w-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                )}
                                <span className="font-medium text-slate-900">Balance Integrity</span>
                            </div>
                            <p className="mt-1 text-sm text-slate-500">
                                {summary?.integrity.balanceIntegrityValid
                                    ? 'All balances match ledger'
                                    : `${summary?.integrity.balanceDiscrepancies} account(s) with issues`}
                            </p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Stats Cards */}
            <div className="grid grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="text-3xl font-bold text-slate-900">
                            {summary?.transactions.total.toLocaleString() || 0}
                        </div>
                        <div className="text-sm text-slate-500">Total Transactions</div>
                        <div className="mt-1 text-xs text-green-600">
                            +{summary?.transactions.today || 0} today
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="text-3xl font-bold text-slate-900">
                            {summary?.accounts.total || 0}
                        </div>
                        <div className="text-sm text-slate-500">Total Accounts</div>
                        <div className="mt-1 text-xs text-slate-400">
                            {summary?.accounts.active || 0} active
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="text-3xl font-bold text-slate-900">
                            {summary?.customers.total || 0}
                        </div>
                        <div className="text-sm text-slate-500">Total Customers</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="text-3xl font-bold text-slate-900">
                            {summary?.auditLogs.total || 0}
                        </div>
                        <div className="text-sm text-slate-500">Audit Log Entries</div>
                        <div className="mt-1 text-xs text-green-600">
                            +{summary?.auditLogs.today || 0} today
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Audit Activity by Type */}
            {summary?.auditLogs.byAction && Object.keys(summary.auditLogs.byAction).length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Audit Activity by Type</CardTitle>
                        <CardDescription>Distribution of audit events</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-4 gap-3">
                            {Object.entries(summary.auditLogs.byAction).map(([action, count]) => (
                                <div key={action} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                    <span className="text-sm font-medium text-slate-700">
                                        {action.replace(/_/g, ' ')}
                                    </span>
                                    <Badge variant="secondary">{count}</Badge>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

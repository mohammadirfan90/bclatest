'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

interface BalanceHealth {
    status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    totalAccounts: number;
    consistentAccounts: number;
    mismatchCount: number;
    lastRebuildAt: string | null;
    checkedAt: string;
}

interface ConsistencyDetail {
    status: string;
    totalAccounts: number;
    consistentAccounts: number;
    mismatchCount: number;
    mismatches: Array<{
        accountId: number;
        accountNumber: string;
        materializedBalance: number;
        computedBalance: number;
        difference: number;
    }>;
}

interface RefreshResult {
    success: boolean;
    accountsRefreshed: number;
    durationMs: number;
    message: string;
}

export function BalanceHealthDashboard() {
    const [health, setHealth] = useState<BalanceHealth | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const [details, setDetails] = useState<ConsistencyDetail | null>(null);
    const [lastResult, setLastResult] = useState<RefreshResult | null>(null);

    const checkHealth = useCallback(async () => {
        try {
            const response = await fetch('/api/v1/admin/balance-consistency');
            if (response.ok) {
                const data = await response.json();
                setHealth(data.data);
            }
        } catch {
            // Ignore errors
        }
        setIsLoading(false);
    }, []);

    useEffect(() => {
        checkHealth();
    }, [checkHealth]);

    const handleRefreshBalances = async () => {
        setShowConfirm(false);
        setIsRefreshing(true);
        setLastResult(null);

        try {
            const response = await fetch('/api/v1/admin/refresh-balances', {
                method: 'POST',
            });
            const data = await response.json();
            setLastResult(data.data);
            await checkHealth();
        } catch {
            setLastResult({
                success: false,
                accountsRefreshed: 0,
                durationMs: 0,
                message: 'Failed to refresh balances',
            });
        }
        setIsRefreshing(false);
    };

    const handleViewDetails = async () => {
        try {
            const response = await fetch('/api/v1/admin/balance-consistency?detailed=true');
            if (response.ok) {
                const data = await response.json();
                setDetails(data.data);
                setShowDetails(true);
            }
        } catch {
            // Ignore errors
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'HEALTHY':
                return 'bg-green-500';
            case 'WARNING':
                return 'bg-yellow-500';
            case 'CRITICAL':
                return 'bg-red-500';
            default:
                return 'bg-gray-500';
        }
    };

    const getStatusBadgeVariant = (status: string) => {
        switch (status) {
            case 'HEALTHY':
                return 'default' as const;
            case 'WARNING':
                return 'secondary' as const;
            case 'CRITICAL':
                return 'destructive' as const;
            default:
                return 'outline' as const;
        }
    };

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Balance Health
                    </CardTitle>
                    <CardDescription>Materialized balance consistency status</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {isLoading ? (
                        <div className="animate-pulse space-y-3">
                            <div className="h-8 bg-slate-200 rounded w-24" />
                            <div className="h-4 bg-slate-200 rounded w-32" />
                        </div>
                    ) : health ? (
                        <>
                            <div className="flex items-center gap-3">
                                <div className={`h-3 w-3 rounded-full ${getStatusColor(health.status)}`} />
                                <Badge variant={getStatusBadgeVariant(health.status)}>
                                    {health.status}
                                </Badge>
                            </div>

                            <div className="text-sm text-slate-600 space-y-1">
                                <p>
                                    <span className="font-medium">{health.consistentAccounts}</span> / {health.totalAccounts} accounts consistent
                                </p>
                                {health.mismatchCount > 0 && (
                                    <p className="text-red-600">
                                        ⚠️ {health.mismatchCount} mismatch{health.mismatchCount > 1 ? 'es' : ''} detected
                                    </p>
                                )}
                                {health.lastRebuildAt && (
                                    <p className="text-xs text-slate-500">
                                        Last rebuild: {new Date(health.lastRebuildAt).toLocaleString()}
                                    </p>
                                )}
                            </div>

                            {lastResult && (
                                <div className={`p-3 rounded text-sm ${lastResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                                    {lastResult.success
                                        ? `✓ Refreshed ${lastResult.accountsRefreshed} accounts in ${lastResult.durationMs}ms`
                                        : `✗ ${lastResult.message}`}
                                </div>
                            )}

                            <div className="flex gap-2 pt-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleViewDetails}
                                    disabled={isRefreshing}
                                >
                                    View Details
                                </Button>
                                <Button
                                    variant="default"
                                    size="sm"
                                    onClick={() => setShowConfirm(true)}
                                    disabled={isRefreshing}
                                >
                                    {isRefreshing ? 'Rebuilding...' : 'Rebuild Balances'}
                                </Button>
                            </div>
                        </>
                    ) : (
                        <p className="text-slate-500">Unable to load balance health</p>
                    )}
                </CardContent>
            </Card>

            {/* Confirmation Dialog */}
            <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Confirm Balance Rebuild</DialogTitle>
                        <DialogDescription>
                            This will recalculate all account balances from the ledger entries.
                            This operation is safe but may take a few seconds for large datasets.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowConfirm(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleRefreshBalances}>
                            Proceed with Rebuild
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Details Dialog */}
            <Dialog open={showDetails} onOpenChange={setShowDetails}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Balance Consistency Details</DialogTitle>
                        <DialogDescription>
                            Comparison of materialized balances vs computed from ledger
                        </DialogDescription>
                    </DialogHeader>
                    {details && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-3 gap-4 text-center">
                                <div className="p-3 bg-slate-50 rounded">
                                    <p className="text-2xl font-bold">{details.totalAccounts}</p>
                                    <p className="text-xs text-slate-500">Total Accounts</p>
                                </div>
                                <div className="p-3 bg-green-50 rounded">
                                    <p className="text-2xl font-bold text-green-700">{details.consistentAccounts}</p>
                                    <p className="text-xs text-slate-500">Consistent</p>
                                </div>
                                <div className="p-3 bg-red-50 rounded">
                                    <p className="text-2xl font-bold text-red-700">{details.mismatchCount}</p>
                                    <p className="text-xs text-slate-500">Mismatches</p>
                                </div>
                            </div>

                            {details.mismatches.length > 0 && (
                                <div className="border rounded">
                                    <div className="grid grid-cols-4 gap-2 p-2 bg-slate-100 text-xs font-medium">
                                        <div>Account</div>
                                        <div className="text-right">Materialized</div>
                                        <div className="text-right">Computed</div>
                                        <div className="text-right">Difference</div>
                                    </div>
                                    {details.mismatches.map((m) => (
                                        <div key={m.accountId} className="grid grid-cols-4 gap-2 p-2 border-t text-sm">
                                            <div className="font-mono">{m.accountNumber}</div>
                                            <div className="text-right">{m.materializedBalance.toLocaleString()}</div>
                                            <div className="text-right">{m.computedBalance.toLocaleString()}</div>
                                            <div className="text-right text-red-600">{m.difference.toLocaleString()}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {details.mismatches.length === 0 && (
                                <div className="p-4 bg-green-50 rounded text-center text-green-700">
                                    ✓ All account balances are consistent with the ledger
                                </div>
                            )}
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowDetails(false)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

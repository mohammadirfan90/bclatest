'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { apiClient } from '@/lib/auth-context';

interface DashboardStats {
    summary: {
        totalCustomers: number;
        activeAccounts: number;
        todayTransactions: number;
        totalBalance: number;
    };
    charts: {
        dailyVolume: { date: string; count: number; total: number }[];
        typeBreakdown: { type: string; count: number; total: number }[];
    };
    recentTransactions: {
        id: number;
        type: string;
        amount: number;
        accountNumber: string;
        createdAt: string;
    }[];
}

export function DashboardStats() {
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadStats();
    }, []);

    const loadStats = async () => {
        try {
            const result = await apiClient<DashboardStats>('/core/stats');
            if (result.success && result.data) {
                setStats(result.data as unknown as DashboardStats);
            } else {
                setError('Failed to load stats');
            }
        } catch (err) {
            setError('Failed to load stats');
        } finally {
            setIsLoading(false);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-BD', {
            style: 'currency',
            currency: 'BDT',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount);
    };

    const formatTimeAgo = (dateString: string) => {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} min ago`;

        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours} hr ago`;

        return date.toLocaleDateString();
    };

    if (isLoading) {
        return (
            <>
                {/* Skeleton cards */}
                {[1, 2, 3, 4].map((i) => (
                    <Card key={i}>
                        <CardHeader className="pb-2">
                            <div className="h-4 w-24 bg-slate-200 rounded animate-pulse" />
                        </CardHeader>
                        <CardContent>
                            <div className="h-8 w-16 bg-slate-200 rounded animate-pulse" />
                        </CardContent>
                    </Card>
                ))}
            </>
        );
    }

    if (error || !stats) {
        return (
            <Card className="col-span-4">
                <CardContent className="p-6 text-center text-slate-500">
                    Failed to load dashboard statistics
                </CardContent>
            </Card>
        );
    }

    return (
        <>
            {/* Summary Stats */}
            <Card>
                <CardHeader className="pb-2">
                    <CardDescription>Total Customers</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-3xl font-bold text-slate-900">
                        {stats.summary.totalCustomers}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">Active customers</p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2">
                    <CardDescription>Active Accounts</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-3xl font-bold text-slate-900">
                        {stats.summary.activeAccounts}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">Across all customers</p>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-2">
                    <CardDescription>Today's Transactions</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-3xl font-bold text-slate-900">
                        {stats.summary.todayTransactions}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">Since midnight</p>
                </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
                <CardHeader className="pb-2">
                    <CardDescription className="text-emerald-700">Total Deposits</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-2xl font-bold text-emerald-800">
                        {formatCurrency(stats.summary.totalBalance)}
                    </p>
                    <p className="text-sm text-emerald-600 mt-1">All account balances</p>
                </CardContent>
            </Card>

            {/* Transaction Type Breakdown */}
            <Card className="md:col-span-2">
                <CardHeader>
                    <CardTitle className="text-lg">Transaction Breakdown</CardTitle>
                    <CardDescription>By transaction type</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {stats.charts.typeBreakdown.map((item) => {
                            const total = stats.charts.typeBreakdown.reduce((sum, i) => sum + i.count, 0);
                            const percentage = total > 0 ? (item.count / total) * 100 : 0;
                            const colors: Record<string, string> = {
                                'DEPOSIT': 'bg-emerald-500',
                                'WITHDRAWAL': 'bg-amber-500',
                                'TRANSFER': 'bg-blue-500',
                            };

                            return (
                                <div key={item.type} className="space-y-1">
                                    <div className="flex justify-between text-sm">
                                        <span className="font-medium">{item.type}</span>
                                        <span className="text-slate-500">
                                            {item.count} ({percentage.toFixed(0)}%)
                                        </span>
                                    </div>
                                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full ${colors[item.type] || 'bg-slate-500'} transition-all`}
                                            style={{ width: `${percentage}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                        {stats.charts.typeBreakdown.length === 0 && (
                            <p className="text-slate-500 text-center py-4">No transactions yet</p>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Daily Volume Chart */}
            <Card className="md:col-span-2">
                <CardHeader>
                    <CardTitle className="text-lg">Transaction Volume</CardTitle>
                    <CardDescription>Last 7 days</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-end gap-2 h-32">
                        {stats.charts.dailyVolume.length > 0 ? (
                            stats.charts.dailyVolume.map((day) => {
                                const maxCount = Math.max(...stats.charts.dailyVolume.map(d => d.count), 1);
                                const height = (day.count / maxCount) * 100;
                                const date = new Date(day.date);

                                return (
                                    <div
                                        key={day.date}
                                        className="flex-1 flex flex-col items-center gap-1"
                                    >
                                        <span className="text-xs text-slate-500">{day.count}</span>
                                        <div
                                            className="w-full bg-gradient-to-t from-blue-500 to-blue-400 rounded-t transition-all"
                                            style={{ height: `${Math.max(height, 5)}%` }}
                                        />
                                        <span className="text-xs text-slate-400">
                                            {date.toLocaleDateString('en-US', { weekday: 'short' })}
                                        </span>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="flex-1 flex items-center justify-center text-slate-500">
                                No transaction data for the last 7 days
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Recent Transactions */}
            <Card className="md:col-span-4">
                <CardHeader>
                    <CardTitle className="text-lg">Recent Transactions</CardTitle>
                    <CardDescription>Latest completed transactions</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {stats.recentTransactions.length > 0 ? (
                            stats.recentTransactions.map((tx) => (
                                <div key={tx.id} className="flex items-center justify-between py-2 border-b last:border-0">
                                    <div>
                                        <p className="font-medium text-sm">{tx.type}</p>
                                        <p className="text-xs text-slate-500">{tx.accountNumber}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className={`font-medium text-sm ${tx.type === 'DEPOSIT' ? 'text-green-600' :
                                                tx.type === 'WITHDRAWAL' ? 'text-amber-600' : ''
                                            }`}>
                                            {tx.type === 'DEPOSIT' ? '+' : tx.type === 'WITHDRAWAL' ? '-' : ''}
                                            ৳{tx.amount.toLocaleString()}
                                        </p>
                                        <p className="text-xs text-slate-500">{formatTimeAgo(tx.createdAt)}</p>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="text-slate-500 text-center py-4">No recent transactions</p>
                        )}
                    </div>
                </CardContent>
            </Card>
        </>
    );
}

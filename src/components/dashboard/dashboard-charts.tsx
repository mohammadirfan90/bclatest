'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { ArrowUpRight, ArrowDownRight, Activity } from 'lucide-react';
import { cn } from '@/lib/utils'; // Assuming this exists, standard in shadcn/ui

interface StatsResponse {
    totalBalance: number;
    monthlyStats: {
        month: string;
        income: number;
        expense: number;
    }[];
    activityStats: {
        type: string;
        count: number;
    }[];
}

async function fetchStats(): Promise<StatsResponse> {
    const res = await fetch('/api/v1/customer/stats');
    if (!res.ok) throw new Error('Failed to fetch stats');
    return res.json();
}

import QueryProvider from '@/components/query-provider';

export function DashboardCharts() {
    return (
        <QueryProvider>
            <DashboardChartsContent />
        </QueryProvider>
    )
}

function DashboardChartsContent() {
    const { data: stats, isLoading, error } = useQuery({
        queryKey: ['customer-stats'],
        queryFn: fetchStats,
        refetchInterval: 30000,
    });

    if (isLoading) {
        return <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 animate-pulse mb-8">
            <div className="col-span-4 h-[200px] bg-muted/20 rounded-xl" />
            <div className="col-span-3 h-[200px] bg-muted/20 rounded-xl" />
        </div>;
    }

    if (error || !stats) return null;

    // Helper for currency
    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('en-BD', { style: 'currency', currency: 'BDT' }).format(val);

    // Calculate max value for scaling monthly chart
    const maxMonthlyVal = Math.max(
        ...stats.monthlyStats.map(m => Math.max(m.income, m.expense)),
        1000 // Minimum scale
    );

    // Calculate max count for activity chart
    const maxActivityCount = Math.max(
        ...stats.activityStats.map(a => a.count),
        5 // Minimum scale
    );

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7 mb-8">
            {/* Monthly Income vs Expense Bar Chart */}
            <Card className="col-span-4 shadow-sm border-0 bg-white/50 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-medium">Financial Overview</CardTitle>
                    <CardDescription>Income vs Expense (Last 6 Months)</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="h-[200px] w-full flex items-end justify-between gap-2 pt-4">
                        {stats.monthlyStats.length === 0 ? (
                            <div className="w-full text-center text-muted-foreground text-sm flex items-center justify-center h-full">
                                No activity data available
                            </div>
                        ) : (
                            stats.monthlyStats.map((item, i) => (
                                <div key={item.month} className="flex flex-col items-center gap-2 flex-1 group relative">
                                    <div className="flex gap-1 w-full justify-center items-end h-full">
                                        {/* Income Bar */}
                                        <div
                                            className="w-3 md:w-6 bg-emerald-500/80 hover:bg-emerald-500 rounded-t-sm transition-all duration-500 relative"
                                            style={{ height: `${(item.income / maxMonthlyVal) * 100}%` }}
                                        >
                                            <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-xs p-1 rounded shadow-lg pointer-events-none whitespace-nowrap z-10 transition-opacity">
                                                +{formatCurrency(item.income)}
                                            </div>
                                        </div>
                                        {/* Expense Bar */}
                                        <div
                                            className="w-3 md:w-6 bg-rose-500/80 hover:bg-rose-500 rounded-t-sm transition-all duration-500 relative"
                                            style={{ height: `${(item.expense / maxMonthlyVal) * 100}%` }}
                                        >
                                            <div className="opacity-0 group-hover:opacity-100 absolute -top-8 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-xs p-1 rounded shadow-lg pointer-events-none whitespace-nowrap z-10 transition-opacity">
                                                -{formatCurrency(item.expense)}
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-[10px] text-muted-foreground font-medium truncate w-full text-center">
                                        {item.month}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Activity Radial / List */}
            <Card className="col-span-3 shadow-sm border-0 bg-white/50 backdrop-blur-sm">
                <CardHeader>
                    <CardTitle className="text-sm font-medium">Activity Breakdown</CardTitle>
                    <CardDescription>Transaction types</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {stats.activityStats.length === 0 ? (
                            <div className="text-center text-muted-foreground text-sm py-8">
                                No activity recorded
                            </div>
                        ) : (
                            stats.activityStats.map((item) => (
                                <div key={item.type} className="flex items-center">
                                    <div className={cn(
                                        "flex h-9 w-9 items-center justify-center rounded-full border border-2",
                                        item.type === 'TRANSFER' ? "border-blue-100 bg-blue-50 text-blue-600" :
                                            item.type === 'DEPOSIT' ? "border-emerald-100 bg-emerald-50 text-emerald-600" :
                                                "border-rose-100 bg-rose-50 text-rose-600"
                                    )}>
                                        {item.type === 'TRANSFER' && <Activity className="h-4 w-4" />}
                                        {item.type === 'DEPOSIT' && <ArrowDownRight className="h-4 w-4" />}
                                        {item.type === 'WITHDRAWAL' && <ArrowUpRight className="h-4 w-4" />}
                                    </div>
                                    <div className="ml-4 space-y-1">
                                        <p className="text-sm font-medium leading-none">{item.type}s</p>
                                        <p className="text-xs text-muted-foreground">
                                            {item.count} transactions
                                        </p>
                                    </div>
                                    <div className="ml-auto font-medium">
                                        {/* Simple percent bar */}
                                        <div className="w-24 h-2 bg-secondary rounded-full overflow-hidden">
                                            <div
                                                className={cn("h-full rounded-full",
                                                    item.type === 'TRANSFER' ? "bg-blue-500" :
                                                        item.type === 'DEPOSIT' ? "bg-emerald-500" : "bg-rose-500"
                                                )}
                                                style={{ width: `${(item.count / maxActivityCount) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}

                        {/* Summary */}
                        <div className="pt-4 border-t flex justify-between items-center text-sm text-muted-foreground">
                            <span>Total Interactions</span>
                            <span className="font-semibold text-foreground">
                                {stats.activityStats.reduce((acc, curr) => acc + curr.count, 0)}
                            </span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

'use client';

import { useState, useEffect } from 'react';
import { format, subMonths } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    TrendingUp,
    TrendingDown,
    DollarSign,
    Users,
    BarChart3,
    RefreshCw,
    Download,
    Calendar,
    Trophy
} from 'lucide-react';
import { apiClient } from '@/lib/auth-context';

interface SystemTotals {
    totalAccounts: number;
    totalActiveAccounts: number;
    totalVolume: number;
    totalDeposits: number;
    totalWithdrawals: number;
    totalTransactions: number;
    avgAccountBalance: number;
}

interface TopAccount {
    rank: number;
    accountId: number;
    accountNumber: string;
    customerName: string;
    category: string;
    metricValue: number;
}

interface MonthlySummary {
    id: number;
    accountId: number;
    accountNumber: string;
    customerName: string;
    year: number;
    month: number;
    closingBalance: number;
    totalDebits: number;
    totalCredits: number;
}

const reportTypes = [
    { id: 'transactions', name: 'Transaction Summary', description: 'Daily transaction summary report' },
    { id: 'balances', name: 'Account Balances', description: 'Current account balance snapshot' },
    { id: 'ledger', name: 'General Ledger', description: 'Double-entry ledger report' },
    { id: 'customers', name: 'Customer Report', description: 'Customer onboarding and status' },
    { id: 'audit', name: 'Audit Trail', description: 'System activity and changes' },
];

export default function AdminReportsPage() {
    const [selectedPeriod, setSelectedPeriod] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [systemTotals, setSystemTotals] = useState<SystemTotals | null>(null);
    const [topAccounts, setTopAccounts] = useState<Record<string, TopAccount[]>>({});
    const [summaries, setSummaries] = useState<MonthlySummary[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRebuilding, setIsRebuilding] = useState(false);
    const [rebuildMessage, setRebuildMessage] = useState<string | null>(null);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-BD', {
            style: 'currency',
            currency: 'BDT',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount);
    };

    const formatNumber = (num: number) => {
        return new Intl.NumberFormat('en-BD').format(num);
    };

    const loadAnalytics = async () => {
        setIsLoading(true);
        try {
            const [year, month] = selectedPeriod.split('-').map(Number);

            // Load monthly summary
            const summaryResult = await apiClient<{
                data: MonthlySummary[];
                summary: SystemTotals;
            }>(`/reports/monthly-summary?year=${year}&month=${month}&size=10`);

            if (summaryResult.success && summaryResult.data) {
                setSystemTotals(summaryResult.data.summary);
                setSummaries(summaryResult.data.data);
            }

            // Load top accounts
            const topResult = await apiClient<{
                data: Record<string, TopAccount[]>;
            }>(`/reports/top-accounts?month=${selectedPeriod}`);

            if (topResult.success && topResult.data) {
                setTopAccounts(topResult.data.data);
            }
        } catch (error) {
            console.error('Failed to load analytics:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadAnalytics();
    }, [selectedPeriod]);

    const handleRebuild = async () => {
        setIsRebuilding(true);
        setRebuildMessage(null);
        try {
            const result = await apiClient<{
                data: { message: string; dailyRowsGenerated: number; monthlyRowsGenerated: number };
            }>('/admin/reports/rebuild', { method: 'POST' });

            if (result.success && result.data) {
                setRebuildMessage(
                    `Rebuild complete: ${result.data.data.dailyRowsGenerated} daily rows, ${result.data.data.monthlyRowsGenerated} monthly rows`
                );
                await loadAnalytics();
            } else {
                setRebuildMessage('Rebuild failed. Check console for details.');
            }
        } catch (error) {
            console.error('Rebuild failed:', error);
            setRebuildMessage('Rebuild failed. Check console for details.');
        } finally {
            setIsRebuilding(false);
        }
    };

    // Generate month options for the last 12 months
    const monthOptions = Array.from({ length: 12 }, (_, i) => {
        const date = subMonths(new Date(), i);
        return {
            value: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
            label: format(date, 'MMMM yyyy'),
        };
    });

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Analytics & Reports</h1>
                    <p className="text-slate-600">Financial analytics and management reports</p>
                </div>
                <div className="flex items-center gap-3">
                    <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                        <SelectTrigger className="w-48">
                            <Calendar className="mr-2 h-4 w-4" />
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {monthOptions.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>
                                    {opt.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button
                        variant="outline"
                        onClick={handleRebuild}
                        disabled={isRebuilding}
                    >
                        <RefreshCw className={`mr-2 h-4 w-4 ${isRebuilding ? 'animate-spin' : ''}`} />
                        {isRebuilding ? 'Rebuilding...' : 'Rebuild Analytics'}
                    </Button>
                </div>
            </div>

            {rebuildMessage && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-700 text-sm">
                    {rebuildMessage}
                </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-blue-600 font-medium">Total Volume</p>
                                <p className="text-2xl font-bold text-blue-800">
                                    {isLoading ? '...' : formatCurrency(systemTotals?.totalVolume || 0)}
                                </p>
                            </div>
                            <div className="h-12 w-12 rounded-full bg-blue-200/50 flex items-center justify-center">
                                <BarChart3 className="h-6 w-6 text-blue-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-emerald-600 font-medium">Total Deposits</p>
                                <p className="text-2xl font-bold text-emerald-800">
                                    {isLoading ? '...' : formatCurrency(systemTotals?.totalDeposits || 0)}
                                </p>
                            </div>
                            <div className="h-12 w-12 rounded-full bg-emerald-200/50 flex items-center justify-center">
                                <TrendingUp className="h-6 w-6 text-emerald-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-rose-50 to-rose-100 border-rose-200">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-rose-600 font-medium">Total Withdrawals</p>
                                <p className="text-2xl font-bold text-rose-800">
                                    {isLoading ? '...' : formatCurrency(systemTotals?.totalWithdrawals || 0)}
                                </p>
                            </div>
                            <div className="h-12 w-12 rounded-full bg-rose-200/50 flex items-center justify-center">
                                <TrendingDown className="h-6 w-6 text-rose-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-violet-50 to-violet-100 border-violet-200">
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-violet-600 font-medium">Transactions</p>
                                <p className="text-2xl font-bold text-violet-800">
                                    {isLoading ? '...' : formatNumber(systemTotals?.totalTransactions || 0)}
                                </p>
                            </div>
                            <div className="h-12 w-12 rounded-full bg-violet-200/50 flex items-center justify-center">
                                <DollarSign className="h-6 w-6 text-violet-600" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Additional Stats Row */}
            <div className="grid grid-cols-3 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="text-center">
                            <p className="text-3xl font-bold text-slate-800">
                                {isLoading ? '...' : formatNumber(systemTotals?.totalAccounts || 0)}
                            </p>
                            <p className="text-sm text-slate-500">Total Accounts</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="text-center">
                            <p className="text-3xl font-bold text-slate-800">
                                {isLoading ? '...' : formatNumber(systemTotals?.totalActiveAccounts || 0)}
                            </p>
                            <p className="text-sm text-slate-500">Active Accounts</p>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="text-center">
                            <p className="text-3xl font-bold text-slate-800">
                                {isLoading ? '...' : formatCurrency(systemTotals?.avgAccountBalance || 0)}
                            </p>
                            <p className="text-sm text-slate-500">Avg Account Balance</p>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Top Accounts */}
            <div className="grid md:grid-cols-3 gap-6">
                {/* Highest Balance */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <Trophy className="h-5 w-5 text-amber-500" />
                            Top Balances
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {(topAccounts.HIGHEST_BALANCE || []).slice(0, 5).map((acc, i) => (
                                <div key={acc.accountId} className="flex items-center justify-between py-2 border-b last:border-0">
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="w-6 h-6 rounded-full p-0 flex items-center justify-center text-xs">
                                            {i + 1}
                                        </Badge>
                                        <div>
                                            <p className="text-sm font-medium">{acc.customerName}</p>
                                            <p className="text-xs text-slate-500">{acc.accountNumber}</p>
                                        </div>
                                    </div>
                                    <p className="font-medium text-emerald-600">{formatCurrency(acc.metricValue)}</p>
                                </div>
                            ))}
                            {(!topAccounts.HIGHEST_BALANCE || topAccounts.HIGHEST_BALANCE.length === 0) && (
                                <p className="text-sm text-slate-500 text-center py-4">No data available</p>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Most Transactions */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <BarChart3 className="h-5 w-5 text-blue-500" />
                            Most Active
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {(topAccounts.MOST_TRANSACTIONS || []).slice(0, 5).map((acc, i) => (
                                <div key={acc.accountId} className="flex items-center justify-between py-2 border-b last:border-0">
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="w-6 h-6 rounded-full p-0 flex items-center justify-center text-xs">
                                            {i + 1}
                                        </Badge>
                                        <div>
                                            <p className="text-sm font-medium">{acc.customerName}</p>
                                            <p className="text-xs text-slate-500">{acc.accountNumber}</p>
                                        </div>
                                    </div>
                                    <p className="font-medium text-blue-600">{formatNumber(acc.metricValue)} txns</p>
                                </div>
                            ))}
                            {(!topAccounts.MOST_TRANSACTIONS || topAccounts.MOST_TRANSACTIONS.length === 0) && (
                                <p className="text-sm text-slate-500 text-center py-4">No data available</p>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Highest Volume */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                            <TrendingUp className="h-5 w-5 text-violet-500" />
                            Highest Volume
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2">
                            {(topAccounts.HIGHEST_VOLUME || []).slice(0, 5).map((acc, i) => (
                                <div key={acc.accountId} className="flex items-center justify-between py-2 border-b last:border-0">
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="w-6 h-6 rounded-full p-0 flex items-center justify-center text-xs">
                                            {i + 1}
                                        </Badge>
                                        <div>
                                            <p className="text-sm font-medium">{acc.customerName}</p>
                                            <p className="text-xs text-slate-500">{acc.accountNumber}</p>
                                        </div>
                                    </div>
                                    <p className="font-medium text-violet-600">{formatCurrency(acc.metricValue)}</p>
                                </div>
                            ))}
                            {(!topAccounts.HIGHEST_VOLUME || topAccounts.HIGHEST_VOLUME.length === 0) && (
                                <p className="text-sm text-slate-500 text-center py-4">No data available</p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Monthly Summaries Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Account Summaries</CardTitle>
                    <CardDescription>Top accounts by balance for {format(new Date(selectedPeriod + '-01'), 'MMMM yyyy')}</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-50">
                                <TableHead>Account</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead className="text-right">Closing Balance</TableHead>
                                <TableHead className="text-right">Credits</TableHead>
                                <TableHead className="text-right">Debits</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                                        Loading...
                                    </TableCell>
                                </TableRow>
                            ) : summaries.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                                        No data for this period. Try running EOD processing or rebuilding analytics.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                summaries.map(summary => (
                                    <TableRow key={summary.id}>
                                        <TableCell className="font-mono text-sm">{summary.accountNumber}</TableCell>
                                        <TableCell>{summary.customerName}</TableCell>
                                        <TableCell className="text-right font-medium">{formatCurrency(summary.closingBalance)}</TableCell>
                                        <TableCell className="text-right text-emerald-600">{formatCurrency(summary.totalCredits)}</TableCell>
                                        <TableCell className="text-right text-rose-600">{formatCurrency(summary.totalDebits)}</TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Report Generation Section */}
            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Generate Report</CardTitle>
                        <CardDescription>Select report type and date range</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label>Report Type</Label>
                            <Select>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select report type" />
                                </SelectTrigger>
                                <SelectContent>
                                    {reportTypes.map(report => (
                                        <SelectItem key={report.id} value={report.id}>
                                            {report.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Start Date</Label>
                                <Input type="date" />
                            </div>
                            <div className="space-y-2">
                                <Label>End Date</Label>
                                <Input type="date" />
                            </div>
                        </div>

                        <Button className="w-full">
                            <Download className="mr-2 h-4 w-4" />
                            Generate Report
                        </Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Available Reports</CardTitle>
                        <CardDescription>Report types and descriptions</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {reportTypes.map(report => (
                                <div key={report.id} className="flex justify-between items-center py-2 border-b last:border-0">
                                    <div>
                                        <p className="font-medium">{report.name}</p>
                                        <p className="text-sm text-slate-500">{report.description}</p>
                                    </div>
                                    <Button variant="outline" size="sm">Quick</Button>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

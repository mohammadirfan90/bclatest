'use client';

import { useState, useEffect } from 'react';
import { format, subDays, subMonths } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    Calendar,
    Download,
    BarChart3,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import { apiClient } from '@/lib/auth-context';

interface DailyTotal {
    id: number;
    accountId: number;
    accountNumber: string;
    customerName: string;
    date: string;
    openingBalance: number;
    closingBalance: number;
    totalDebits: number;
    totalCredits: number;
    debitCount: number;
    creditCount: number;
}

interface SystemTotals {
    totalAccounts: number;
    totalActiveAccounts: number;
    totalVolume: number;
    totalDeposits: number;
    totalWithdrawals: number;
    totalTransactions: number;
    avgAccountBalance: number;
}

export default function BankerReportsPage() {
    const [selectedDate, setSelectedDate] = useState(() => format(subDays(new Date(), 1), 'yyyy-MM-dd'));
    const [dailyTotals, setDailyTotals] = useState<DailyTotal[]>([]);
    const [systemTotals, setSystemTotals] = useState<SystemTotals | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-BD', {
            style: 'currency',
            currency: 'BDT',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        }).format(amount);
    };

    const loadDailyReport = async () => {
        setIsLoading(true);
        try {
            const result = await apiClient<{
                data: DailyTotal[];
                summary: SystemTotals;
                meta: { totalItems: number; totalPages: number };
            }>(`/reports/daily-totals?date=${selectedDate}&page=${page}&size=25`);

            if (result.success && result.data) {
                setDailyTotals(result.data.data || []);
                setSystemTotals(result.data.summary || null);
                // Ensure meta exists before accessing props
                const meta = result.data.meta || { totalPages: 1, totalItems: 0 };
                setTotalPages(meta.totalPages || 1);
                setTotalItems(meta.totalItems || 0);
            }
        } catch (error) {
            console.error('Failed to load daily report:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadDailyReport();
    }, [selectedDate, page]);

    const exportToCsv = () => {
        if (!dailyTotals || dailyTotals.length === 0) return;

        const headers = ['Account Number', 'Customer Name', 'Opening Balance', 'Credits', 'Debits', 'Closing Balance', 'Credit Count', 'Debit Count'];
        const rows = dailyTotals.map(t => [
            t.accountNumber,
            t.customerName,
            t.openingBalance,
            t.totalCredits,
            t.totalDebits,
            t.closingBalance,
            t.creditCount,
            t.debitCount,
        ]);

        const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `daily-report-${selectedDate}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Daily Reports</h1>
                    <p className="text-slate-600">View daily transaction summaries by account</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <Label>Date</Label>
                        <Input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => { setSelectedDate(e.target.value); setPage(1); }}
                            className="w-44"
                        />
                    </div>
                    <Button variant="outline" onClick={exportToCsv} disabled={!dailyTotals || dailyTotals.length === 0}>
                        <Download className="mr-2 h-4 w-4" />
                        Export CSV
                    </Button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500">Total Volume</p>
                                <p className="text-xl font-bold text-slate-800">
                                    {isLoading ? '...' : formatCurrency(systemTotals?.totalVolume || 0)}
                                </p>
                            </div>
                            <BarChart3 className="h-8 w-8 text-blue-500" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500">Deposits</p>
                                <p className="text-xl font-bold text-emerald-600">
                                    {isLoading ? '...' : formatCurrency(systemTotals?.totalDeposits || 0)}
                                </p>
                            </div>
                            <TrendingUp className="h-8 w-8 text-emerald-500" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500">Withdrawals</p>
                                <p className="text-xl font-bold text-rose-600">
                                    {isLoading ? '...' : formatCurrency(systemTotals?.totalWithdrawals || 0)}
                                </p>
                            </div>
                            <TrendingDown className="h-8 w-8 text-rose-500" />
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-6">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-500">Transactions</p>
                                <p className="text-xl font-bold text-slate-800">
                                    {isLoading ? '...' : (systemTotals?.totalTransactions || 0).toLocaleString()}
                                </p>
                            </div>
                            <Calendar className="h-8 w-8 text-violet-500" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Daily Totals Table */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Account Daily Totals</CardTitle>
                    <CardDescription>
                        {format(new Date(selectedDate), 'EEEE, MMMM d, yyyy')} • {totalItems} accounts
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-50 hover:bg-slate-50">
                                <TableHead>Account</TableHead>
                                <TableHead>Customer</TableHead>
                                <TableHead className="text-right">Opening</TableHead>
                                <TableHead className="text-right">Credits</TableHead>
                                <TableHead className="text-right">Debits</TableHead>
                                <TableHead className="text-right">Closing</TableHead>
                                <TableHead className="text-center">Txns</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                                        Loading...
                                    </TableCell>
                                </TableRow>
                            ) : !dailyTotals || dailyTotals.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                                        No data for this date. EOD processing may not have run yet.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                dailyTotals.map(total => (
                                    <TableRow key={total.id}>
                                        <TableCell className="font-mono text-sm">{total.accountNumber}</TableCell>
                                        <TableCell>{total.customerName}</TableCell>
                                        <TableCell className="text-right">{formatCurrency(total.openingBalance)}</TableCell>
                                        <TableCell className="text-right text-emerald-600 font-medium">
                                            {total.totalCredits > 0 ? `+${formatCurrency(total.totalCredits)}` : '-'}
                                        </TableCell>
                                        <TableCell className="text-right text-rose-600 font-medium">
                                            {total.totalDebits > 0 ? `-${formatCurrency(total.totalDebits)}` : '-'}
                                        </TableCell>
                                        <TableCell className="text-right font-medium">{formatCurrency(total.closingBalance)}</TableCell>
                                        <TableCell className="text-center">
                                            <Badge variant="secondary">{total.creditCount + total.debitCount}</Badge>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-600">
                        Page {page} of {totalPages}
                    </p>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page === 1}
                            onClick={() => setPage(p => p - 1)}
                        >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page === totalPages}
                            onClick={() => setPage(p => p + 1)}
                        >
                            Next
                            <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

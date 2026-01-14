'use client';

import { useState, useEffect, useCallback } from 'react';
import { format, subMonths, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Download, FileText, ChevronLeft, ChevronRight } from 'lucide-react';
import { apiClient } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

interface Account {
    id: number;
    accountNumber: string;
    accountTypeName: string;
}

interface StatementEntry {
    id: number;
    date: string;
    description: string | null;
    debit: number | null;
    credit: number | null;
    runningBalance: number;
    transactionReference: string;
    transactionType: string;
}

interface Statement {
    account: {
        id: number;
        accountNumber: string;
        accountType: string;
        customerName: string;
    };
    period: {
        from: string;
        to: string;
    };
    openingBalance: number;
    closingBalance: number;
    totalDebits: number;
    totalCredits: number;
    entries: StatementEntry[];
}

interface PaginationMeta {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
}

export default function StatementsPage() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<string>('');
    const [fromDate, setFromDate] = useState<Date>(startOfMonth(subMonths(new Date(), 1)));
    const [toDate, setToDate] = useState<Date>(endOfMonth(subMonths(new Date(), 1)));
    const [statement, setStatement] = useState<Statement | null>(null);
    const [meta, setMeta] = useState<PaginationMeta | null>(null);
    const [page, setPage] = useState(1);
    const [isLoading, setIsLoading] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    useEffect(() => {
        loadAccounts();
    }, []);

    const loadAccounts = async () => {
        const result = await apiClient<Account[]>('/accounts');
        if (result.success && result.data) {
            setAccounts(result.data);
            if (result.data.length > 0) {
                setSelectedAccountId(result.data[0].id.toString());
            }
        }
    };

    const loadStatement = useCallback(async () => {
        if (!selectedAccountId) return;

        setIsLoading(true);
        try {
            const params = new URLSearchParams({
                from: format(fromDate, 'yyyy-MM-dd'),
                to: format(toDate, 'yyyy-MM-dd'),
                page: page.toString(),
                size: '50',
            });

            const result = await apiClient<Statement & { meta?: PaginationMeta }>(
                `/accounts/${selectedAccountId}/statement?${params.toString()}`
            );

            if (result.success && result.data) {
                setStatement(result.data);
                // Handle meta from response
                const response = result as any;
                setMeta(response.meta || null);
            }
        } catch (error) {
            console.error('Failed to load statement:', error);
        } finally {
            setIsLoading(false);
        }
    }, [selectedAccountId, fromDate, toDate, page]);

    useEffect(() => {
        if (selectedAccountId) {
            loadStatement();
        }
    }, [loadStatement, selectedAccountId]);

    const handleDownloadPdf = async () => {
        if (!selectedAccountId) return;

        setIsDownloading(true);
        try {
            const month = format(fromDate, 'yyyy-MM');
            const response = await fetch(`/api/v1/accounts/${selectedAccountId}/statement/pdf?month=${month}`, {
                headers: {
                    Authorization: `Bearer ${localStorage.getItem('token')}`,
                },
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `statement_${month}.pdf`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }
        } catch (error) {
            console.error('Failed to download PDF:', error);
        } finally {
            setIsDownloading(false);
        }
    };

    const setQuickPeriod = (period: string) => {
        const now = new Date();
        switch (period) {
            case 'thisMonth':
                setFromDate(startOfMonth(now));
                setToDate(now);
                break;
            case 'lastMonth':
                setFromDate(startOfMonth(subMonths(now, 1)));
                setToDate(endOfMonth(subMonths(now, 1)));
                break;
            case 'last3Months':
                setFromDate(startOfMonth(subMonths(now, 3)));
                setToDate(now);
                break;
            case 'last6Months':
                setFromDate(startOfMonth(subMonths(now, 6)));
                setToDate(now);
                break;
            case 'lastYear':
                setFromDate(startOfMonth(subMonths(now, 12)));
                setToDate(now);
                break;
        }
        setPage(1);
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-BD', {
            style: 'currency',
            currency: 'BDT',
            minimumFractionDigits: 2,
        }).format(amount);
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Account Statements</h1>
                <p className="text-slate-600 mt-1">View your transaction history and download statements</p>
            </div>

            {/* Account and Period Selection */}
            <Card>
                <CardHeader className="pb-4">
                    <CardTitle className="text-base">Select Account & Period</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {/* Account Selector */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Account</label>
                            <Select value={selectedAccountId} onValueChange={(v) => { setSelectedAccountId(v); setPage(1); }}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select account" />
                                </SelectTrigger>
                                <SelectContent>
                                    {accounts.map((acc) => (
                                        <SelectItem key={acc.id} value={acc.id.toString()}>
                                            {acc.accountNumber} ({acc.accountTypeName})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* From Date */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">From Date</label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className={cn(
                                            'w-full justify-start text-left font-normal',
                                            !fromDate && 'text-muted-foreground'
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {fromDate ? format(fromDate, 'PPP') : 'Pick a date'}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={fromDate}
                                        onSelect={(d) => d && setFromDate(d)}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        {/* To Date */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">To Date</label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        className={cn(
                                            'w-full justify-start text-left font-normal',
                                            !toDate && 'text-muted-foreground'
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {toDate ? format(toDate, 'PPP') : 'Pick a date'}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={toDate}
                                        onSelect={(d) => d && setToDate(d)}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>

                        {/* Actions */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">&nbsp;</label>
                            <Button
                                onClick={handleDownloadPdf}
                                disabled={!selectedAccountId || isDownloading}
                                className="w-full bg-emerald-600 hover:bg-emerald-700"
                            >
                                <Download className="mr-2 h-4 w-4" />
                                {isDownloading ? 'Downloading...' : 'Download PDF'}
                            </Button>
                        </div>
                    </div>

                    {/* Quick Period Buttons */}
                    <div className="flex flex-wrap gap-2">
                        <span className="text-sm text-slate-500 mr-2">Quick Select:</span>
                        <Button variant="outline" size="sm" onClick={() => setQuickPeriod('thisMonth')}>
                            This Month
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setQuickPeriod('lastMonth')}>
                            Last Month
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setQuickPeriod('last3Months')}>
                            Last 3 Months
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setQuickPeriod('last6Months')}>
                            Last 6 Months
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setQuickPeriod('lastYear')}>
                            Last Year
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Statement Summary */}
            {statement && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="bg-gradient-to-br from-slate-50 to-slate-100">
                        <CardContent className="pt-6">
                            <p className="text-sm text-slate-500">Opening Balance</p>
                            <p className="text-xl font-bold text-slate-900">
                                {formatCurrency(statement.openingBalance)}
                            </p>
                        </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100">
                        <CardContent className="pt-6">
                            <p className="text-sm text-emerald-600">Total Credits</p>
                            <p className="text-xl font-bold text-emerald-700">
                                +{formatCurrency(statement.totalCredits)}
                            </p>
                        </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-rose-50 to-rose-100">
                        <CardContent className="pt-6">
                            <p className="text-sm text-rose-600">Total Debits</p>
                            <p className="text-xl font-bold text-rose-700">
                                -{formatCurrency(statement.totalDebits)}
                            </p>
                        </CardContent>
                    </Card>
                    <Card className="bg-gradient-to-br from-blue-50 to-blue-100">
                        <CardContent className="pt-6">
                            <p className="text-sm text-blue-600">Closing Balance</p>
                            <p className="text-xl font-bold text-blue-700">
                                {formatCurrency(statement.closingBalance)}
                            </p>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Transaction Table */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <FileText className="h-5 w-5" />
                        Transaction History
                    </CardTitle>
                    {statement && (
                        <CardDescription>
                            {format(new Date(statement.period.from), 'PPP')} - {format(new Date(statement.period.to), 'PPP')}
                        </CardDescription>
                    )}
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-50 hover:bg-slate-50">
                                <TableHead>Date</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Reference</TableHead>
                                <TableHead className="text-right">Debit</TableHead>
                                <TableHead className="text-right">Credit</TableHead>
                                <TableHead className="text-right font-semibold">Balance</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                                        Loading statement...
                                    </TableCell>
                                </TableRow>
                            ) : !statement || statement.entries.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                                        No transactions found for the selected period.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                <>
                                    {/* Opening Balance Row */}
                                    <TableRow className="bg-slate-50/50">
                                        <TableCell className="text-slate-600">
                                            {format(new Date(statement.period.from), 'MMM dd, yyyy')}
                                        </TableCell>
                                        <TableCell className="font-medium text-slate-700" colSpan={2}>
                                            Opening Balance
                                        </TableCell>
                                        <TableCell></TableCell>
                                        <TableCell></TableCell>
                                        <TableCell className="text-right font-bold text-slate-900">
                                            {formatCurrency(statement.openingBalance)}
                                        </TableCell>
                                    </TableRow>

                                    {/* Transaction Entries */}
                                    {statement.entries.map((entry) => (
                                        <TableRow key={entry.id}>
                                            <TableCell className="text-slate-600">
                                                {format(new Date(entry.date), 'MMM dd, yyyy')}
                                            </TableCell>
                                            <TableCell className="text-slate-900">
                                                {entry.description || entry.transactionType}
                                            </TableCell>
                                            <TableCell className="font-mono text-xs text-slate-500">
                                                {entry.transactionReference}
                                            </TableCell>
                                            <TableCell className="text-right text-rose-600 font-medium">
                                                {entry.debit ? formatCurrency(entry.debit) : ''}
                                            </TableCell>
                                            <TableCell className="text-right text-emerald-600 font-medium">
                                                {entry.credit ? formatCurrency(entry.credit) : ''}
                                            </TableCell>
                                            <TableCell className="text-right font-bold text-slate-900">
                                                {formatCurrency(entry.runningBalance)}
                                            </TableCell>
                                        </TableRow>
                                    ))}

                                    {/* Closing Balance Row */}
                                    <TableRow className="bg-slate-50/50">
                                        <TableCell className="text-slate-600">
                                            {format(new Date(statement.period.to), 'MMM dd, yyyy')}
                                        </TableCell>
                                        <TableCell className="font-medium text-slate-700" colSpan={2}>
                                            Closing Balance
                                        </TableCell>
                                        <TableCell></TableCell>
                                        <TableCell></TableCell>
                                        <TableCell className="text-right font-bold text-blue-600">
                                            {formatCurrency(statement.closingBalance)}
                                        </TableCell>
                                    </TableRow>
                                </>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Pagination */}
            {meta && meta.totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-600">
                        Showing page {meta.currentPage} of {meta.totalPages} ({meta.totalItems} transactions)
                    </p>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={meta.currentPage === 1}
                            onClick={() => setPage(meta.currentPage - 1)}
                        >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={meta.currentPage === meta.totalPages}
                            onClick={() => setPage(meta.currentPage + 1)}
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

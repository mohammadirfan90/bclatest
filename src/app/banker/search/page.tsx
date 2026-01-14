'use client';

import { useState, useEffect, useCallback } from 'react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
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
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    CalendarIcon,
    Download,
    Search,
    ChevronDown,
    ChevronUp,
    Filter,
    X,
    RefreshCw
} from 'lucide-react';
import { apiClient } from '@/lib/auth-context';
import { cn } from '@/lib/utils';

interface SearchResult {
    id: number;
    transactionReference: string;
    transactionType: string;
    accountId: number;
    accountNumber: string;
    entryType: 'DEBIT' | 'CREDIT';
    amount: number;
    balanceAfter: number;
    description: string | null;
    entryDate: string;
    createdAt: string;
    isReversal: boolean;
}

interface PaginationMeta {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
}

export default function TransactionSearchPage() {
    const [results, setResults] = useState<SearchResult[]>([]);
    const [meta, setMeta] = useState<PaginationMeta | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [filtersOpen, setFiltersOpen] = useState(true);

    // Filter states
    const [fromDate, setFromDate] = useState<Date | undefined>();
    const [toDate, setToDate] = useState<Date | undefined>();
    const [amountMin, setAmountMin] = useState('');
    const [amountMax, setAmountMax] = useState('');
    const [entryType, setEntryType] = useState('ALL');
    const [transactionType, setTransactionType] = useState('ALL');
    const [reference, setReference] = useState('');
    const [accountId, setAccountId] = useState('');
    const [includeReversals, setIncludeReversals] = useState(true);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState('50');

    const buildSearchParams = useCallback(() => {
        const params = new URLSearchParams();
        if (fromDate) params.append('from', format(fromDate, 'yyyy-MM-dd'));
        if (toDate) params.append('to', format(toDate, 'yyyy-MM-dd'));
        if (amountMin) params.append('amountMin', amountMin);
        if (amountMax) params.append('amountMax', amountMax);
        if (entryType && entryType !== 'ALL') params.append('entryType', entryType);
        if (transactionType && transactionType !== 'ALL') params.append('transactionType', transactionType);
        if (reference) params.append('reference', reference);
        if (accountId) params.append('accountId', accountId);
        params.append('includeReversals', includeReversals.toString());
        params.append('page', page.toString());
        params.append('size', pageSize);
        return params;
    }, [fromDate, toDate, amountMin, amountMax, entryType, transactionType, reference, accountId, includeReversals, page, pageSize]);

    const searchTransactions = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = buildSearchParams();
            const result = await apiClient<SearchResult[]>(`/transactions/search?${params.toString()}`);

            if (result.success && result.data) {
                setResults(result.data);
                const response = result as any;
                setMeta(response.meta || null);
            }
        } catch (error) {
            console.error('Search failed:', error);
        } finally {
            setIsLoading(false);
        }
    }, [buildSearchParams]);

    useEffect(() => {
        searchTransactions();
    }, [page, pageSize]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        searchTransactions();
    };

    const handleExportCsv = async () => {
        try {
            const params = buildSearchParams();
            params.append('export', 'csv');

            const response = await fetch(`/api/v1/transactions/search?${params.toString()}`, {
                headers: {
                    Authorization: `Bearer ${localStorage.getItem('token')}`,
                },
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `transactions_${format(new Date(), 'yyyy-MM-dd')}.csv`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }
        } catch (error) {
            console.error('Export failed:', error);
        }
    };

    const clearFilters = () => {
        setFromDate(undefined);
        setToDate(undefined);
        setAmountMin('');
        setAmountMax('');
        setEntryType('ALL');
        setTransactionType('ALL');
        setReference('');
        setAccountId('');
        setIncludeReversals(true);
        setPage(1);
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-BD', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(amount);
    };

    const activeFilterCount = [
        fromDate,
        toDate,
        amountMin,
        amountMax,
        entryType !== 'ALL' ? entryType : null,
        transactionType !== 'ALL' ? transactionType : null,
        reference,
        accountId,
        !includeReversals,
    ].filter(Boolean).length;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Transaction Search</h1>
                    <p className="text-slate-600 mt-1">
                        Advanced search across all ledger entries
                    </p>
                </div>
                <Button onClick={handleExportCsv} variant="outline" className="gap-2">
                    <Download className="h-4 w-4" />
                    Export CSV
                </Button>
            </div>

            {/* Filter Panel */}
            <Card>
                <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
                    <CollapsibleTrigger asChild>
                        <CardHeader className="pb-3 cursor-pointer hover:bg-slate-50 transition-colors">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base flex items-center gap-2">
                                    <Filter className="h-4 w-4" />
                                    Search Filters
                                    {activeFilterCount > 0 && (
                                        <Badge variant="secondary" className="ml-2">
                                            {activeFilterCount} active
                                        </Badge>
                                    )}
                                </CardTitle>
                                {filtersOpen ? (
                                    <ChevronUp className="h-4 w-4 text-slate-500" />
                                ) : (
                                    <ChevronDown className="h-4 w-4 text-slate-500" />
                                )}
                            </div>
                        </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                        <CardContent>
                            <form onSubmit={handleSearch} className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {/* Date Range */}
                                    <div className="space-y-2">
                                        <Label>From Date</Label>
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
                                                    {fromDate ? format(fromDate, 'PPP') : 'Select date'}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar
                                                    mode="single"
                                                    selected={fromDate}
                                                    onSelect={setFromDate}
                                                    initialFocus
                                                />
                                            </PopoverContent>
                                        </Popover>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>To Date</Label>
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
                                                    {toDate ? format(toDate, 'PPP') : 'Select date'}
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0" align="start">
                                                <Calendar
                                                    mode="single"
                                                    selected={toDate}
                                                    onSelect={setToDate}
                                                    initialFocus
                                                />
                                            </PopoverContent>
                                        </Popover>
                                    </div>

                                    {/* Amount Range */}
                                    <div className="space-y-2">
                                        <Label>Min Amount</Label>
                                        <Input
                                            type="number"
                                            placeholder="0.00"
                                            value={amountMin}
                                            onChange={(e) => setAmountMin(e.target.value)}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <Label>Max Amount</Label>
                                        <Input
                                            type="number"
                                            placeholder="No limit"
                                            value={amountMax}
                                            onChange={(e) => setAmountMax(e.target.value)}
                                        />
                                    </div>

                                    {/* Entry Type */}
                                    <div className="space-y-2">
                                        <Label>Entry Type</Label>
                                        <Select value={entryType} onValueChange={setEntryType}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="ALL">All Types</SelectItem>
                                                <SelectItem value="DEBIT">Debit Only</SelectItem>
                                                <SelectItem value="CREDIT">Credit Only</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Transaction Type */}
                                    <div className="space-y-2">
                                        <Label>Transaction Type</Label>
                                        <Select value={transactionType} onValueChange={setTransactionType}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="ALL">All Types</SelectItem>
                                                <SelectItem value="TRANSFER">Transfer</SelectItem>
                                                <SelectItem value="DEPOSIT">Deposit</SelectItem>
                                                <SelectItem value="WITHDRAWAL">Withdrawal</SelectItem>
                                                <SelectItem value="INTEREST">Interest</SelectItem>
                                                <SelectItem value="FEE">Fee</SelectItem>
                                                <SelectItem value="REVERSAL">Reversal</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Reference Search */}
                                    <div className="space-y-2">
                                        <Label>Reference / Description</Label>
                                        <Input
                                            placeholder="Search..."
                                            value={reference}
                                            onChange={(e) => setReference(e.target.value)}
                                        />
                                    </div>

                                    {/* Account ID */}
                                    <div className="space-y-2">
                                        <Label>Account ID</Label>
                                        <Input
                                            type="number"
                                            placeholder="e.g. 1001"
                                            value={accountId}
                                            onChange={(e) => setAccountId(e.target.value)}
                                        />
                                    </div>
                                </div>

                                {/* Include Reversals Toggle */}
                                <div className="flex items-center space-x-2">
                                    <Switch
                                        id="include-reversals"
                                        checked={includeReversals}
                                        onCheckedChange={setIncludeReversals}
                                    />
                                    <Label htmlFor="include-reversals">Include reversed transactions</Label>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex gap-2">
                                    <Button type="submit" className="bg-slate-900 hover:bg-slate-800">
                                        <Search className="mr-2 h-4 w-4" />
                                        Search
                                    </Button>
                                    <Button type="button" variant="outline" onClick={clearFilters}>
                                        <X className="mr-2 h-4 w-4" />
                                        Clear Filters
                                    </Button>
                                    <Button type="button" variant="ghost" onClick={searchTransactions}>
                                        <RefreshCw className="mr-2 h-4 w-4" />
                                        Refresh
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </CollapsibleContent>
                </Collapsible>
            </Card>

            {/* Results Table */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base">
                            Search Results
                            {meta && (
                                <span className="text-sm font-normal text-slate-500 ml-2">
                                    ({meta.totalItems} transactions found)
                                </span>
                            )}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                            <Label className="text-sm text-slate-500">Page Size:</Label>
                            <Select value={pageSize} onValueChange={(v) => { setPageSize(v); setPage(1); }}>
                                <SelectTrigger className="w-20">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="20">20</SelectItem>
                                    <SelectItem value="50">50</SelectItem>
                                    <SelectItem value="100">100</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-slate-50 hover:bg-slate-50">
                                    <TableHead className="w-[80px]">ID</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Reference</TableHead>
                                    <TableHead>Account</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Entry</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                    <TableHead className="text-right">Balance</TableHead>
                                    <TableHead>Description</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="text-center py-8 text-slate-500">
                                            Searching...
                                        </TableCell>
                                    </TableRow>
                                ) : results.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} className="text-center py-8 text-slate-500">
                                            No transactions found matching your criteria.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    results.map((result) => (
                                        <TableRow
                                            key={result.id}
                                            className={result.isReversal ? 'bg-amber-50/50' : ''}
                                        >
                                            <TableCell className="font-medium text-slate-600">
                                                #{result.id}
                                            </TableCell>
                                            <TableCell className="text-slate-600 whitespace-nowrap">
                                                {format(new Date(result.createdAt), 'MMM dd, yyyy HH:mm')}
                                            </TableCell>
                                            <TableCell className="font-mono text-xs text-slate-500">
                                                {result.transactionReference}
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {result.accountNumber}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className="text-xs">
                                                    {result.transactionType}
                                                </Badge>
                                                {result.isReversal && (
                                                    <Badge variant="secondary" className="text-xs ml-1 bg-amber-100 text-amber-700">
                                                        REVERSED
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge
                                                    variant="outline"
                                                    className={
                                                        result.entryType === 'CREDIT'
                                                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                            : 'bg-rose-50 text-rose-700 border-rose-200'
                                                    }
                                                >
                                                    {result.entryType}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className={`text-right font-medium ${result.entryType === 'CREDIT' ? 'text-emerald-600' : 'text-rose-600'
                                                }`}>
                                                {result.entryType === 'DEBIT' ? '-' : '+'}
                                                {formatCurrency(result.amount)}
                                            </TableCell>
                                            <TableCell className="text-right font-mono text-slate-600">
                                                {formatCurrency(result.balanceAfter)}
                                            </TableCell>
                                            <TableCell className="max-w-[200px] truncate text-slate-600">
                                                {result.description || '-'}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Pagination */}
            {meta && meta.totalPages > 1 && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-600">
                        Page {meta.currentPage} of {meta.totalPages}
                    </p>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={meta.currentPage === 1}
                            onClick={() => setPage(meta.currentPage - 1)}
                        >
                            Previous
                        </Button>
                        {/* Page numbers */}
                        <div className="flex gap-1">
                            {Array.from({ length: Math.min(5, meta.totalPages) }, (_, i) => {
                                let pageNum;
                                if (meta.totalPages <= 5) {
                                    pageNum = i + 1;
                                } else if (meta.currentPage <= 3) {
                                    pageNum = i + 1;
                                } else if (meta.currentPage >= meta.totalPages - 2) {
                                    pageNum = meta.totalPages - 4 + i;
                                } else {
                                    pageNum = meta.currentPage - 2 + i;
                                }
                                return (
                                    <Button
                                        key={pageNum}
                                        variant={meta.currentPage === pageNum ? 'default' : 'outline'}
                                        size="sm"
                                        className="w-8"
                                        onClick={() => setPage(pageNum)}
                                    >
                                        {pageNum}
                                    </Button>
                                );
                            })}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={meta.currentPage === meta.totalPages}
                            onClick={() => setPage(meta.currentPage + 1)}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}

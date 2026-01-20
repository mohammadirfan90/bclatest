'use client';

import { useState, useEffect } from 'react';
import { format, subMonths } from 'date-fns';
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
    Search,
    Download,
    ChevronLeft,
    ChevronRight,
    Filter,
    X
} from 'lucide-react';
import { apiClient } from '@/lib/auth-context';

interface SearchResult {
    id: number;
    transactionReference: string;
    type: string;
    typeName: string;
    sourceAccount: string | null;
    destAccount: string | null;
    sourceOwner: string | null;
    destOwner: string | null;
    entryType: 'DEBIT' | 'CREDIT' | null;
    amount: number;
    status: string;
    description: string | null;
    createdAt: string;
    isReversal: boolean;
}

export default function TransactionSearchPage() {
    // Filter state
    const [fromDate, setFromDate] = useState(() => format(subMonths(new Date(), 1), 'yyyy-MM-dd'));
    const [toDate, setToDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
    const [amountMin, setAmountMin] = useState('');
    const [amountMax, setAmountMax] = useState('');
    const [entryType, setEntryType] = useState<'ALL' | 'DEBIT' | 'CREDIT'>('ALL');
    const [transactionType, setTransactionType] = useState('');
    const [reference, setReference] = useState('');
    const [accountId, setAccountId] = useState('');
    const [includeReversals, setIncludeReversals] = useState(true);

    // Results state
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [showFilters, setShowFilters] = useState(true);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-BD', {
            style: 'currency',
            currency: 'BDT',
            minimumFractionDigits: 2,
        }).format(amount);
    };

    const performSearch = async (resetPage = false) => {
        if (resetPage) setPage(1);
        setIsLoading(true);

        try {
            const params = new URLSearchParams();
            params.append('from', fromDate);
            params.append('to', toDate);
            params.append('page', resetPage ? '1' : String(page));
            params.append('size', '25');

            if (amountMin) params.append('amountMin', amountMin);
            if (amountMax) params.append('amountMax', amountMax);
            if (entryType !== 'ALL') params.append('entryType', entryType);
            if (transactionType) params.append('transactionType', transactionType);
            if (reference) params.append('reference', reference);
            if (accountId) params.append('accountId', accountId);
            if (!includeReversals) params.append('includeReversals', 'false');

            const result = await apiClient<{
                results: SearchResult[];
                total: number;
            }>(`/banker/transactions?${params.toString()}`);

            if (result.success && result.data) {
                setResults(result.data.results || []);
                setTotalItems(result.data.total || 0);
                setTotalPages(Math.ceil((result.data.total || 0) / 25));
            }
        } catch (error) {
            console.error('Search failed:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        performSearch();
    }, [page]);

    const clearFilters = () => {
        setFromDate(format(subMonths(new Date(), 1), 'yyyy-MM-dd'));
        setToDate(format(new Date(), 'yyyy-MM-dd'));
        setAmountMin('');
        setAmountMax('');
        setEntryType('ALL');
        setTransactionType('');
        setReference('');
        setAccountId('');
        setIncludeReversals(true);
    };

    const exportToCsv = () => {
        if (!results || results.length === 0) return;

        const headers = ['Date', 'Reference', 'Type', 'Source Account', 'Dest Account', 'Entry Type', 'Amount', 'Status', 'Description'];
        const rows = results.map(r => [
            format(new Date(r.createdAt), 'yyyy-MM-dd'),
            r.transactionReference,
            r.type,
            r.sourceAccount || 'System',
            r.destAccount || 'System',
            r.entryType || 'BOTH',
            r.amount,
            r.status,
            r.description || '',
        ]);

        const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transactions-${fromDate}-to-${toDate}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Transaction Search</h1>
                    <p className="text-slate-600">Search and filter ledger entries</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowFilters(!showFilters)}
                    >
                        <Filter className="h-4 w-4 mr-2" />
                        {showFilters ? 'Hide Filters' : 'Show Filters'}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={exportToCsv}
                        disabled={!results || results.length === 0}
                    >
                        <Download className="h-4 w-4 mr-2" />
                        Export CSV
                    </Button>
                </div>
            </div>

            {/* Filter Panel */}
            {showFilters && (
                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-base">Search Filters</CardTitle>
                            <Button variant="ghost" size="sm" onClick={clearFilters}>
                                <X className="h-4 w-4 mr-1" />
                                Clear
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="space-y-2">
                                <Label>From Date</Label>
                                <Input
                                    type="date"
                                    value={fromDate}
                                    onChange={(e) => setFromDate(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>To Date</Label>
                                <Input
                                    type="date"
                                    value={toDate}
                                    onChange={(e) => setToDate(e.target.value)}
                                />
                            </div>
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
                            <div className="space-y-2">
                                <Label>Entry Type</Label>
                                <Select value={entryType} onValueChange={(v) => setEntryType(v as 'ALL' | 'DEBIT' | 'CREDIT')}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ALL">All Entries</SelectItem>
                                        <SelectItem value="DEBIT">Debit (Withdrawal/Transfer Out)</SelectItem>
                                        <SelectItem value="CREDIT">Credit (Deposit/Transfer In)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Transaction Type</Label>
                                <Select value={transactionType || 'ALL'} onValueChange={(v) => setTransactionType(v === 'ALL' ? '' : v)}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="All Types" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ALL">All Types</SelectItem>
                                        <SelectItem value="TRANSFER">Transfer</SelectItem>
                                        <SelectItem value="DEPOSIT">Deposit</SelectItem>
                                        <SelectItem value="WITHDRAWAL">Withdrawal</SelectItem>
                                        <SelectItem value="INTEREST">Interest</SelectItem>
                                        <SelectItem value="REVERSAL">Reversal</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Reference</Label>
                                <Input
                                    placeholder="Transaction reference..."
                                    value={reference}
                                    onChange={(e) => setReference(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Account ID</Label>
                                <Input
                                    type="number"
                                    placeholder="Account ID..."
                                    value={accountId}
                                    onChange={(e) => setAccountId(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="mt-4 flex items-center justify-between">
                            <label className="flex items-center gap-2 text-sm">
                                <input
                                    type="checkbox"
                                    checked={includeReversals}
                                    onChange={(e) => setIncludeReversals(e.target.checked)}
                                    className="rounded border-slate-300"
                                />
                                Include reversals
                            </label>
                            <Button onClick={() => performSearch(true)}>
                                <Search className="h-4 w-4 mr-2" />
                                Search
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Results Table */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Search Results</CardTitle>
                    <CardDescription>
                        {totalItems.toLocaleString()} entries found
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-50 hover:bg-slate-50">
                                <TableHead>Date</TableHead>
                                <TableHead>Reference</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Account</TableHead>
                                <TableHead className="text-center">Entry</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead className="text-right">Balance After</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                                        Searching...
                                    </TableCell>
                                </TableRow>
                            ) : !results || results.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                                        No transactions found matching your criteria
                                    </TableCell>
                                </TableRow>
                            ) : (
                                results.map(result => (
                                    <TableRow key={result.id} className={result.isReversal ? 'bg-amber-50/50' : ''}>
                                        <TableCell className="text-slate-600">
                                            {format(new Date(result.createdAt), 'MMM dd, yyyy')}
                                        </TableCell>
                                        <TableCell className="font-mono text-xs">
                                            {result.transactionReference.substring(0, 8)}...
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={result.isReversal ? 'secondary' : 'outline'}>
                                                {result.type}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="font-mono text-sm">
                                            {result.sourceAccount || 'N/A'} → {result.destAccount || 'N/A'}
                                            <div className="text-[10px] text-slate-400 truncate max-w-[150px]">
                                                {result.sourceOwner || 'System'} to {result.destOwner || 'System'}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-center">
                                            <Badge
                                                variant="outline"
                                                className={result.entryType === 'CREDIT'
                                                    ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
                                                    : result.entryType === 'DEBIT'
                                                        ? 'border-rose-300 text-rose-700 bg-rose-50'
                                                        : 'border-slate-300 text-slate-700 bg-slate-50'
                                                }
                                            >
                                                {result.entryType || 'BOTH'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className={`text-right font-medium ${result.entryType === 'CREDIT' ? 'text-emerald-600' : result.entryType === 'DEBIT' ? 'text-rose-600' : ''
                                            }`}>
                                            {result.entryType === 'CREDIT' ? '+' : result.entryType === 'DEBIT' ? '-' : ''}{formatCurrency(result.amount)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <span className="text-slate-400 text-xs">{result.status}</span>
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

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
import { Badge } from '@/components/ui/badge';
import { useAuth, apiClient } from '@/lib/auth-context';

interface LedgerEntry {
    id: number;
    transactionReference: string;
    accountNumber: string;
    entryType: 'DEBIT' | 'CREDIT';
    amount: number;
    currency: string;
    balanceAfter: number;
    description: string;
    entryDate: string;
    createdAt: string;
}

interface PaginationMeta {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
}

export default function LedgerPage() {
    const { token } = useAuth(); // Keep token for dependency triggering
    const router = useRouter();
    const searchParams = useSearchParams();

    const [entries, setEntries] = useState<LedgerEntry[]>([]);
    const [meta, setMeta] = useState<PaginationMeta | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Filter states
    const [accountId, setAccountId] = useState(searchParams.get('accountId') || '');
    const [transactionId, setTransactionId] = useState(searchParams.get('transactionId') || '');
    const [entryType, setEntryType] = useState(searchParams.get('entryType') || 'ALL');
    const [page, setPage] = useState(parseInt(searchParams.get('page') || '1') || 1); // Fallback if NaN

    const fetchLedger = useCallback(async () => {
        setIsLoading(true);
        try {
            const params = new URLSearchParams();
            if (accountId) params.append('accountId', accountId);
            if (transactionId) params.append('transactionId', transactionId);
            if (entryType && entryType !== 'ALL') params.append('entryType', entryType);
            params.append('page', page.toString());
            params.append('limit', '20');

            // Use apiClient instead of fetch
            const res = await apiClient<{ data: LedgerEntry[], meta: PaginationMeta }>(`/banker/ledger?${params.toString()}`);

            if (res.success && res.data) {
                // apiClient returns the whole body as data or wrapped?
                // Based on auth-context: return await response.json().
                // Our API returns { success: true, data: [...], meta: {...} }
                // So res is that object (since we type T as the whole response shape? Or T as 'data' prop?)
                // Wait. apiClient<T> implementation:
                // return { success: boolean, data?: T, error? } wrapper created by the Client? 
                // OR does it return the server response directly?
                // Let's re-read auth-context carefully.
                // Line 227: return data; (where data = await response.json())
                // So apiClient returns the RAW JSON response from server.
                // The return type Promise<{ success: boolean; data?: T; error?: string }> corresponds to our standard API response shape.
                // So `res.data` is the array of entries.
                // `res.meta` should also exist if we define the type correctly.
                // BUT the signature in auth-context.ts line 171 is:
                // Promise<{ success: boolean; data?: T; error?: string }>
                // It does NOT include `meta`.
                // So TypeScript might complain if I access `res.meta`.
                // I should cast or assume T includes meta?
                // If I pass T = LedgerEntry[], then res.data is LedgerEntry[].
                // But meta is a sibling of data.
                // I should likely treat the result as `any` or extend the type locally.

                // Correction: The `apiClient` return type definition IS restrictive. 
                // However, at runtime it returns excess properties.
                // I will cast res to any to access meta safely.

                const response = res as any;
                setEntries(response.data || []);
                setMeta(response.meta || null);
            } else {
                setEntries([]);
                setMeta(null);
            }
        } catch (error) {
            console.error('Failed to fetch ledger:', error);
            setEntries([]);
        } finally {
            setIsLoading(false);
        }
    }, [accountId, transactionId, entryType, page, token]);

    useEffect(() => {
        // We only fetch if we have a token (or auth is ready)
        // Actually apiClient handles token internally, but let's wait until 'token' is present to avoid premature 401 calls if context loading
        if (token) {
            fetchLedger();
        }
    }, [fetchLedger, token]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1); // Reset to page 1 on search
        fetchLedger();
    };

    const clearFilters = () => {
        setAccountId('');
        setTransactionId('');
        setEntryType('ALL');
        setPage(1);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Financial Ledger</h1>
                    <p className="text-slate-600 mt-1">
                        Immutable record of all financial movements (Double-Entry).
                    </p>
                </div>
            </div>

            {/* Filters */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base">Filter Ledger</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSearch} className="grid grid-cols-1 gap-4 md:grid-cols-4 lg:grid-cols-5 items-end">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Account ID</label>
                            <Input
                                placeholder="e.g. 1001"
                                value={accountId}
                                onChange={(e) => setAccountId(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Transaction ID</label>
                            <Input
                                placeholder="e.g. 550"
                                value={transactionId}
                                onChange={(e) => setTransactionId(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Entry Type</label>
                            <Select value={entryType} onValueChange={setEntryType}>
                                <SelectTrigger>
                                    <SelectValue placeholder="All" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">All Types</SelectItem>
                                    <SelectItem value="DEBIT">Debit</SelectItem>
                                    <SelectItem value="CREDIT">Credit</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex gap-2 lg:col-span-2">
                            <Button type="submit" className="flex-1 bg-slate-900 hover:bg-slate-800">
                                Apply Filter
                            </Button>
                            <Button type="button" variant="outline" onClick={clearFilters}>
                                Reset
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            {/* Data Table */}
            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-slate-50 hover:bg-slate-50">
                                <TableHead className="w-[100px]">Entry ID</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Transaction Ref</TableHead>
                                <TableHead>Account Number</TableHead>
                                <TableHead>Description</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead className="text-right">Amount</TableHead>
                                <TableHead className="text-right">Balance After</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                                        Loading ledger entries...
                                    </TableCell>
                                </TableRow>
                            ) : entries.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                                        No ledger entries found matching your filters.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                entries.map((entry) => (
                                    <TableRow key={entry.id}>
                                        <TableCell className="font-medium text-slate-600">#{entry.id}</TableCell>
                                        <TableCell className="text-slate-600">
                                            {format(new Date(entry.createdAt), 'MMM dd, yyyy HH:mm')}
                                        </TableCell>
                                        <TableCell className="font-mono text-xs text-slate-500">
                                            {entry.transactionReference}
                                        </TableCell>
                                        <TableCell className="text-slate-900 font-medium">
                                            {entry.accountNumber}
                                        </TableCell>
                                        <TableCell className="max-w-[250px] truncate text-slate-600">
                                            {entry.description}
                                        </TableCell>
                                        <TableCell>
                                            <Badge
                                                variant="outline"
                                                className={
                                                    entry.entryType === 'CREDIT'
                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                        : 'bg-rose-50 text-rose-700 border-rose-200'
                                                }
                                            >
                                                {entry.entryType}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className={`text-right font-medium ${entry.entryType === 'CREDIT' ? 'text-emerald-600' : 'text-rose-600'
                                            }`}>
                                            {entry.entryType === 'DEBIT' ? '-' : '+'}
                                            {entry.currency} {entry.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </TableCell>
                                        <TableCell className="text-right text-slate-600 font-mono">
                                            {entry.balanceAfter.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Pagination */}
            {meta && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-slate-600">
                        Showing {(meta.currentPage - 1) * meta.itemsPerPage + 1} to{' '}
                        {Math.min(meta.currentPage * meta.itemsPerPage, meta.totalItems)} of {meta.totalItems} entries
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

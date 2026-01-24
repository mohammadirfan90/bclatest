'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/auth-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// =============================================================================
// Types
// =============================================================================

interface Transaction {
    id: number;
    transactionReference: string;
    amount: number;
    currency: string;
    status: string;
    description: string | null;
    createdAt: string;
    type: string;
    typeName: string;
    sourceAccount: string | null;
    destAccount: string | null;
    sourceOwner: string | null;
    destOwner: string | null;
}

// =============================================================================
// Component
// =============================================================================

export default function AuditorTransactionsPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [offset, setOffset] = useState(0);
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [typeFilter, setTypeFilter] = useState('ALL');
    const [search, setSearch] = useState('');
    const [exporting, setExporting] = useState(false);

    // Date range for export (default to last 30 days)
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const [fromDate, setFromDate] = useState(thirtyDaysAgo);
    const [toDate, setToDate] = useState(today);

    const limit = 25;

    const fetchTransactions = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
            if (statusFilter && statusFilter !== 'ALL') params.set('status', statusFilter);
            if (typeFilter && typeFilter !== 'ALL') params.set('type', typeFilter);
            if (search) params.set('reference', search);

            const res = await apiClient<{ transactions: Transaction[]; total: number }>(`/auditor/transactions?${params}`);
            if (res.success && res.data) {
                setTransactions(res.data.transactions);
                setTotal(res.data.total);
            }
        } catch (err) {
            console.error('Failed to fetch transactions:', err);
        } finally {
            setLoading(false);
        }
    }, [offset, statusFilter, typeFilter, search]);

    useEffect(() => {
        fetchTransactions();
    }, [fetchTransactions]);

    const handleSearch = () => {
        setOffset(0);
        fetchTransactions();
    };

    const handleExportPDF = async () => {
        setExporting(true);
        try {
            const token = localStorage.getItem('token');
            const response = await fetch(`/api/v1/auditor/export-pdf/transactions?from=${fromDate}&to=${toDate}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                },
            });
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `transactions-${fromDate}-to-${toDate}.pdf`;
                a.click();
                window.URL.revokeObjectURL(url);
            } else {
                console.error('Export failed:', response.status, await response.text());
            }
        } catch (err) {
            console.error('Export failed:', err);
        } finally {
            setExporting(false);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'COMPLETED': return <Badge className="bg-green-100 text-green-700">Completed</Badge>;
            case 'PENDING': return <Badge variant="secondary">Pending</Badge>;
            case 'FAILED': return <Badge variant="destructive">Failed</Badge>;
            case 'REVERSED': return <Badge variant="outline">Reversed</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    const formatCurrency = (amount: number, currency: string = 'BDT') => {
        return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Transactions</h1>
                    <p className="text-slate-600">View all system transactions (read-only)</p>
                </div>
                <div className="flex items-center gap-2">
                    <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-36" />
                    <span className="text-slate-400">to</span>
                    <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-36" />
                    <Button onClick={handleExportPDF} disabled={exporting}>
                        {exporting ? 'Exporting...' : 'Export PDF'}
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Transaction History</CardTitle>
                            <CardDescription>{total} total transactions</CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Transaction reference..."
                                className="w-64"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            />
                            <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setOffset(0); }}>
                                <SelectTrigger className="w-36">
                                    <SelectValue placeholder="All types" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">All types</SelectItem>
                                    <SelectItem value="TRANSFER">Transfer</SelectItem>
                                    <SelectItem value="DEPOSIT">Deposit</SelectItem>
                                    <SelectItem value="WITHDRAWAL">Withdrawal</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setOffset(0); }}>
                                <SelectTrigger className="w-36">
                                    <SelectValue placeholder="All statuses" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">All statuses</SelectItem>
                                    <SelectItem value="COMPLETED">Completed</SelectItem>
                                    <SelectItem value="PENDING">Pending</SelectItem>
                                    <SelectItem value="FAILED">Failed</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button variant="outline" onClick={fetchTransactions}>Refresh</Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="text-center py-8 text-slate-500">Loading...</div>
                    ) : (
                        <>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Reference</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead>From</TableHead>
                                        <TableHead>To</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Date</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {transactions.map((tx) => (
                                        <TableRow key={tx.id}>
                                            <TableCell className="font-mono text-xs">
                                                {tx.transactionReference.slice(0, 8)}...
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{tx.type}</Badge>
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {formatCurrency(tx.amount, tx.currency)}
                                            </TableCell>
                                            <TableCell>
                                                {tx.sourceAccount ? (
                                                    <div>
                                                        <div className="font-mono text-sm">{tx.sourceAccount}</div>
                                                        <div className="text-xs text-slate-500">{tx.sourceOwner}</div>
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-400">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {tx.destAccount ? (
                                                    <div>
                                                        <div className="font-mono text-sm">{tx.destAccount}</div>
                                                        <div className="text-xs text-slate-500">{tx.destOwner}</div>
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-400">—</span>
                                                )}
                                            </TableCell>
                                            <TableCell>{getStatusBadge(tx.status)}</TableCell>
                                            <TableCell className="text-sm">
                                                {new Date(tx.createdAt).toLocaleString()}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {transactions.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                                                No transactions found
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>

                            {/* Pagination */}
                            <div className="flex items-center justify-between mt-4">
                                <div className="text-sm text-slate-500">
                                    Showing {offset + 1} to {Math.min(offset + limit, total)} of {total}
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={offset === 0}
                                        onClick={() => setOffset(Math.max(0, offset - limit))}
                                    >
                                        Previous
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        disabled={offset + limit >= total}
                                        onClick={() => setOffset(offset + limit)}
                                    >
                                        Next
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

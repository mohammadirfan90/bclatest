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

interface LedgerEntry {
    id: number;
    transactionId: number;
    accountId: number;
    entryType: 'DEBIT' | 'CREDIT';
    amount: number;
    currency: string;
    balanceAfter: number;
    description: string | null;
    entryDate: string;
    createdAt: string;
    accountNumber: string;
    transactionReference: string;
}

// =============================================================================
// Component
// =============================================================================

export default function AuditorLedgerPage() {
    const [entries, setEntries] = useState<LedgerEntry[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [offset, setOffset] = useState(0);
    const [entryTypeFilter, setEntryTypeFilter] = useState('ALL');
    const [exporting, setExporting] = useState(false);

    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const [fromDate, setFromDate] = useState(thirtyDaysAgo);
    const [toDate, setToDate] = useState(today);

    const limit = 25;

    const fetchEntries = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
            if (entryTypeFilter && entryTypeFilter !== 'ALL') params.set('entryType', entryTypeFilter);

            const res = await apiClient<{ entries: LedgerEntry[]; total: number }>(`/auditor/ledger?${params}`);
            if (res.success && res.data) {
                setEntries(res.data.entries);
                setTotal(res.data.total);
            }
        } catch (err) {
            console.error('Failed to fetch ledger entries:', err);
        } finally {
            setLoading(false);
        }
    }, [offset, entryTypeFilter]);

    useEffect(() => {
        fetchEntries();
    }, [fetchEntries]);

    const handleExportPDF = async () => {
        setExporting(true);
        try {
            const token = localStorage.getItem('token');
            const params = new URLSearchParams({ from: fromDate, to: toDate });
            if (entryTypeFilter !== 'ALL') params.set('entryType', entryTypeFilter);
            const response = await fetch(`/api/v1/auditor/export-pdf/ledger?${params}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `ledger-${fromDate}-to-${toDate}.pdf`;
                a.click();
                window.URL.revokeObjectURL(url);
            }
        } catch (err) {
            console.error('Export failed:', err);
        } finally {
            setExporting(false);
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
                    <h1 className="text-2xl font-bold text-slate-900">Ledger</h1>
                    <p className="text-slate-600">Double-entry ledger records (read-only)</p>
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
                            <CardTitle>Ledger Entries</CardTitle>
                            <CardDescription>{total} total entries</CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Select value={entryTypeFilter} onValueChange={(v) => { setEntryTypeFilter(v); setOffset(0); }}>
                                <SelectTrigger className="w-36">
                                    <SelectValue placeholder="All types" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">All types</SelectItem>
                                    <SelectItem value="DEBIT">Debit</SelectItem>
                                    <SelectItem value="CREDIT">Credit</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button variant="outline" onClick={fetchEntries}>Refresh</Button>
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
                                        <TableHead className="w-16">ID</TableHead>
                                        <TableHead>Account</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Amount</TableHead>
                                        <TableHead>Balance After</TableHead>
                                        <TableHead>Transaction</TableHead>
                                        <TableHead>Date</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {entries.map((entry) => (
                                        <TableRow key={entry.id}>
                                            <TableCell className="font-mono text-sm">{entry.id}</TableCell>
                                            <TableCell className="font-mono text-sm">{entry.accountNumber}</TableCell>
                                            <TableCell>
                                                {entry.entryType === 'CREDIT' ? (
                                                    <Badge className="bg-green-100 text-green-700">Credit</Badge>
                                                ) : (
                                                    <Badge className="bg-red-100 text-red-700">Debit</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className={`font-medium ${entry.entryType === 'CREDIT' ? 'text-green-600' : 'text-red-600'}`}>
                                                {entry.entryType === 'CREDIT' ? '+' : '-'}
                                                {formatCurrency(entry.amount, entry.currency)}
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {formatCurrency(entry.balanceAfter, entry.currency)}
                                            </TableCell>
                                            <TableCell className="font-mono text-xs">
                                                {entry.transactionReference.slice(0, 8)}...
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {new Date(entry.entryDate).toLocaleDateString()}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {entries.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                                                No ledger entries found
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

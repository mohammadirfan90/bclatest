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

interface Account {
    id: number;
    accountNumber: string;
    customerId: number;
    customerNumber: string;
    customerName: string;
    accountType: string;
    accountTypeName: string;
    status: string;
    balance: number;
    currency: string;
    createdAt: string;
}

// =============================================================================
// Component
// =============================================================================

export default function AuditorAccountsPage() {
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [offset, setOffset] = useState(0);
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [typeFilter, setTypeFilter] = useState('ALL');
    const [search, setSearch] = useState('');
    const limit = 25;

    const fetchAccounts = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
            if (statusFilter && statusFilter !== 'ALL') params.set('status', statusFilter);
            if (typeFilter && typeFilter !== 'ALL') params.set('accountType', typeFilter);
            if (search) params.set('search', search);

            const res = await apiClient<{ accounts: Account[]; total: number }>(`/auditor/accounts?${params}`);
            if (res.success && res.data) {
                setAccounts(res.data.accounts);
                setTotal(res.data.total);
            }
        } catch (err) {
            console.error('Failed to fetch accounts:', err);
        } finally {
            setLoading(false);
        }
    }, [offset, statusFilter, typeFilter, search]);

    useEffect(() => {
        fetchAccounts();
    }, [fetchAccounts]);

    const handleSearch = () => {
        setOffset(0);
        fetchAccounts();
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'ACTIVE': return <Badge className="bg-green-100 text-green-700">Active</Badge>;
            case 'PENDING': return <Badge variant="secondary">Pending</Badge>;
            case 'SUSPENDED': return <Badge variant="destructive">Suspended</Badge>;
            case 'CLOSED': return <Badge variant="outline">Closed</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    const formatCurrency = (amount: number, currency: string = 'BDT') => {
        return `${currency} ${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Accounts</h1>
                <p className="text-slate-600">View all account records (read-only)</p>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Account List</CardTitle>
                            <CardDescription>{total} total accounts</CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Search account number..."
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
                                    <SelectItem value="SAVINGS">Savings</SelectItem>
                                    <SelectItem value="CHECKING">Checking</SelectItem>
                                    <SelectItem value="FIXED">Fixed Deposit</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setOffset(0); }}>
                                <SelectTrigger className="w-36">
                                    <SelectValue placeholder="All statuses" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">All statuses</SelectItem>
                                    <SelectItem value="ACTIVE">Active</SelectItem>
                                    <SelectItem value="PENDING">Pending</SelectItem>
                                    <SelectItem value="SUSPENDED">Suspended</SelectItem>
                                    <SelectItem value="CLOSED">Closed</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button variant="outline" onClick={fetchAccounts}>Refresh</Button>
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
                                        <TableHead>Account #</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Customer</TableHead>
                                        <TableHead>Balance</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Opened</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {accounts.map((account) => (
                                        <TableRow key={account.id}>
                                            <TableCell className="font-mono text-sm">{account.accountNumber}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline">{account.accountType}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="font-medium">{account.customerName}</div>
                                                <div className="text-xs text-slate-500">{account.customerNumber}</div>
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {formatCurrency(account.balance, account.currency)}
                                            </TableCell>
                                            <TableCell>{getStatusBadge(account.status)}</TableCell>
                                            <TableCell className="text-sm">
                                                {new Date(account.createdAt).toLocaleDateString()}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {accounts.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                                                No accounts found
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

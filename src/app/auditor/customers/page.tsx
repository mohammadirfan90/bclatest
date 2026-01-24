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

interface Customer {
    id: number;
    customerNumber: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    status: string;
    kycStatus: string;
    createdAt: string;
    accountCount: number;
}

// =============================================================================
// Component
// =============================================================================

export default function AuditorCustomersPage() {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [offset, setOffset] = useState(0);
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [search, setSearch] = useState('');
    const limit = 25;

    const fetchCustomers = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
            if (statusFilter && statusFilter !== 'ALL') params.set('status', statusFilter);
            if (search) params.set('search', search);

            const res = await apiClient<{ customers: Customer[]; total: number }>(`/auditor/customers?${params}`);
            if (res.success && res.data) {
                setCustomers(res.data.customers);
                setTotal(res.data.total);
            }
        } catch (err) {
            console.error('Failed to fetch customers:', err);
        } finally {
            setLoading(false);
        }
    }, [offset, statusFilter, search]);

    useEffect(() => {
        fetchCustomers();
    }, [fetchCustomers]);

    const handleSearch = () => {
        setOffset(0);
        fetchCustomers();
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'ACTIVE': return <Badge className="bg-green-100 text-green-700">Active</Badge>;
            case 'PENDING': return <Badge variant="secondary">Pending</Badge>;
            case 'SUSPENDED': return <Badge variant="destructive">Suspended</Badge>;
            default: return <Badge variant="outline">{status}</Badge>;
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
                <p className="text-slate-600">View all customer records (read-only)</p>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Customer List</CardTitle>
                            <CardDescription>{total} total customers</CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Input
                                placeholder="Search by email, name..."
                                className="w-64"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            />
                            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setOffset(0); }}>
                                <SelectTrigger className="w-36">
                                    <SelectValue placeholder="All statuses" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">All statuses</SelectItem>
                                    <SelectItem value="ACTIVE">Active</SelectItem>
                                    <SelectItem value="PENDING">Pending</SelectItem>
                                    <SelectItem value="SUSPENDED">Suspended</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button variant="outline" onClick={fetchCustomers}>Refresh</Button>
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
                                        <TableHead>Customer #</TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Phone</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>KYC</TableHead>
                                        <TableHead>Accounts</TableHead>
                                        <TableHead>Joined</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {customers.map((customer) => (
                                        <TableRow key={customer.id}>
                                            <TableCell className="font-mono text-sm">{customer.customerNumber}</TableCell>
                                            <TableCell className="font-medium">
                                                {customer.firstName} {customer.lastName}
                                            </TableCell>
                                            <TableCell className="text-sm">{customer.email}</TableCell>
                                            <TableCell className="text-sm">{customer.phone || '—'}</TableCell>
                                            <TableCell>{getStatusBadge(customer.status)}</TableCell>
                                            <TableCell>
                                                <Badge variant={customer.kycStatus === 'VERIFIED' ? 'default' : 'secondary'}>
                                                    {customer.kycStatus}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-center">{customer.accountCount}</TableCell>
                                            <TableCell className="text-sm">
                                                {new Date(customer.createdAt).toLocaleDateString()}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {customers.length === 0 && (
                                        <TableRow>
                                            <TableCell colSpan={8} className="text-center py-8 text-slate-500">
                                                No customers found
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

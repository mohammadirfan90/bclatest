'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth, apiClient } from '@/lib/auth-context';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface Customer {
    id: number;
    customer_number: string;
    first_name: string;
    last_name: string;
    email: string;
    status: string;
    kyc_status: string;
    onboarding_status: string;
    primary_account_id: number;
    created_at: string;
}

export default function BankerCustomersPage() {
    const { token } = useAuth();
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchCustomers = async () => {
        try {
            const res = await apiClient<Customer[]>('/banker/customers?limit=100');
            if (res.success && res.data) {
                setCustomers(res.data);
            } else {
                setError(res.error || 'Failed to fetch customers');
            }
        } catch (err) {
            setError('Failed to connect to server');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (token) {
            fetchCustomers();
        }
    }, [token]);

    if (loading) return <div className="p-8 text-center">Loading customers...</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Customer Management</h1>
                    <p className="text-slate-600">Overview of bank customers and their account status.</p>
                </div>
            </div>

            {error && (
                <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                </Alert>
            )}

            <div className="border rounded-md">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Customer #</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Account Status</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {customers.map((c) => (
                            <TableRow key={c.id}>
                                <TableCell className="font-mono text-xs">{c.customer_number}</TableCell>
                                <TableCell className="font-medium">{c.first_name} {c.last_name}</TableCell>
                                <TableCell>{c.email}</TableCell>
                                <TableCell>
                                    <Badge variant={
                                        c.onboarding_status === 'HAS_ACCOUNT' ? 'default' : 'outline'
                                    }>
                                        {c.onboarding_status?.replace('_', ' ') || 'NO ACCOUNT'}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-right space-x-2">
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        asChild
                                    >
                                        <Link href={`/banker/customers/${c.id}`}>View Details</Link>
                                    </Button>
                                </TableCell>
                            </TableRow>
                        ))}
                        {customers.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                                    No customers found.
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}

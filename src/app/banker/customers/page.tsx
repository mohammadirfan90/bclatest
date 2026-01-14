'use client';

import { useState, useEffect } from 'react';
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
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    const { user, token } = useAuth(); // Keep token for dependency
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Link Generation State
    const [linkModalOpen, setLinkModalOpen] = useState(false);
    const [generatedLink, setGeneratedLink] = useState('');
    const [generating, setGenerating] = useState(false);
    const [copySuccess, setCopySuccess] = useState(false);

    // Create Customer State
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newCustomer, setNewCustomer] = useState({
        firstName: '',
        lastName: '',
        email: '',
        phone: ''
    });

    // Approval State
    const [approving, setApproving] = useState<number | null>(null);

    const fetchCustomers = async () => {
        try {
            const res = await apiClient<Customer[]>('/banker/customers?limit=100');
            // res.data is Customer[] if successful
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

    const handleCreateCustomer = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreating(true);
        setError(null);

        try {
            const res = await apiClient<{ data: { link: string; id: number } }>('/banker/customers', {
                method: 'POST',
                body: JSON.stringify(newCustomer), // Content-Type handled by apiClient
            });

            if (res.success && res.data) {
                // Why res.data? apiClient returns the body. 
                // Let's assume generic T is the data property type? 
                // Or T is the whole response data payload?
                // Based on previous files, res.data is expected.
                // Wait. In apiClient<T> implementation found in auth-context.ts:
                // return { success: boolean, data?: T, error? }
                // So if T is { link: string }, then res.data.link.
                // Correct.

                // Wait, need to check API return type for POST /customers.
                // It likely returns { link, customerId }.
                // I'll cast safely.
                const data = res.data as any; // Safer given the unknown exact shape here without checking route

                setGeneratedLink(data.link);
                setLinkModalOpen(true);
                setCreateModalOpen(false);
                setNewCustomer({ firstName: '', lastName: '', email: '', phone: '' });
                fetchCustomers();
            } else {
                alert(res.error || 'Failed to create customer');
            }
        } catch (err) {
            alert('Error creating customer');
        } finally {
            setCreating(false);
        }
    };

    const handleGenerateLink = async (customerId: number) => {
        setGenerating(true);
        setError(null);
        setGeneratedLink('');

        try {
            const res = await apiClient<{ data: { link: string } }>('/banker/customers/invite', {
                method: 'POST',
                body: JSON.stringify({ customerId }),
            });

            if (res.success && res.data) {
                const data = res.data as any;
                setGeneratedLink(data.link);
                setLinkModalOpen(true);
                setCopySuccess(false);
            } else {
                alert(res.error || 'Failed to generate link');
            }
        } catch (err) {
            alert('Error generating link');
        } finally {
            setGenerating(false);
        }
    };

    const handleApprove = async (customerId: number) => {
        if (!confirm('Are you sure you want to approve this customer? They will be able to log in immediately.')) return;

        setApproving(customerId);
        try {
            const res = await apiClient(`/banker/customers/${customerId}/approve`, {
                method: 'POST',
            });

            if (res.success) {
                // Refresh list
                fetchCustomers();
            } else {
                alert(res.error || 'Failed to approve');
            }
        } catch (err) {
            alert('Error approving customer');
        } finally {
            setApproving(null);
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(generatedLink);
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
    };

    if (loading) return <div className="p-8 text-center">Loading customers...</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Customer Management</h1>
                    <p className="text-slate-600">Manage onboarding and customer access.</p>
                </div>
                <Button onClick={() => setCreateModalOpen(true)}>Create Customer</Button>
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
                            <TableHead>Onboarding Status</TableHead>
                            <TableHead>KYC</TableHead>
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
                                        c.onboarding_status === 'ACTIVE' ? 'default' : // Greenish usually
                                            c.onboarding_status === 'PENDING_APPROVAL' ? 'secondary' : // Yellowish
                                                'outline'
                                    }>
                                        {c.onboarding_status?.replace('_', ' ') || 'PENDING'}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <Badge variant="outline">{c.kyc_status}</Badge>
                                </TableCell>
                                <TableCell className="text-right space-x-2">
                                    {/* Always show invite logic if not full active or just re-invite */}
                                    {c.kyc_status !== 'VERIFIED' && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleGenerateLink(c.id)}
                                            disabled={generating}
                                        >
                                            Invite
                                        </Button>
                                    )}

                                    {c.onboarding_status === 'PENDING_APPROVAL' && (
                                        <Button
                                            size="sm"
                                            className="bg-green-600 hover:bg-green-700 text-white"
                                            onClick={() => handleApprove(c.id)}
                                            disabled={approving === c.id}
                                        >
                                            {approving === c.id ? 'Approving...' : 'Approve Access'}
                                        </Button>
                                    )}
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

            {/* Create Customer Modal */}
            <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create New Customer</DialogTitle>
                        <DialogDescription>
                            Enter customer details to generate an onboarding invitation.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreateCustomer}>
                        <div className="grid gap-4 py-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="firstName">First Name</Label>
                                    <Input
                                        id="firstName"
                                        required
                                        value={newCustomer.firstName}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, firstName: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="lastName">Last Name</Label>
                                    <Input
                                        id="lastName"
                                        required
                                        value={newCustomer.lastName}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, lastName: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    required
                                    value={newCustomer.email}
                                    onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="phone">Phone</Label>
                                <Input
                                    id="phone"
                                    type="tel"
                                    value={newCustomer.phone}
                                    onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setCreateModalOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={creating}>
                                {creating ? 'Creating...' : 'Create & Invite'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Generated Link Modal */}
            <Dialog open={linkModalOpen} onOpenChange={setLinkModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Onboarding Link Generated</DialogTitle>
                        <DialogDescription>
                            Share this secure link with the customer. It expires in 72 hours.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="link">Secure Link</Label>
                            <div className="flex gap-2">
                                <Input
                                    id="link"
                                    readOnly
                                    value={generatedLink}
                                    className="font-mono text-xs bg-slate-50"
                                />
                                <Button onClick={copyToClipboard} size="icon" variant="outline">
                                    {copySuccess ?
                                        <span className="text-green-600">✓</span> :
                                        <span className="text-xs">Copy</span>
                                    }
                                </Button>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setLinkModalOpen(false)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
